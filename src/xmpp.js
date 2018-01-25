var Adapter, Client, Element, EnterMessage, JID, LeaveMessage, Robot, Stanza, TextMessage, XmppBot, parse, ref, ref1, util, uuid,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice;

ref = require('hubot'), Adapter = ref.Adapter, Robot = ref.Robot, TextMessage = ref.TextMessage, EnterMessage = ref.EnterMessage, LeaveMessage = ref.LeaveMessage;

ref1 = require('node-xmpp-client'), JID = ref1.JID, Stanza = ref1.Stanza, Client = ref1.Client, parse = ref1.parse, Element = ref1.Element;

uuid = require('uuid');

util = require('util');

XmppBot = (function(superClass) {
  extend(XmppBot, superClass);

  XmppBot.prototype.reconnectTryCount = 0;

  XmppBot.prototype.currentIqId = 1001;

  XmppBot.prototype.joining = [];

  XmppBot.prototype.joined = [];

  function XmppBot(robot) {
    this.checkCanStart = bind(this.checkCanStart, this);
    this.offline = bind(this.offline, this);
    this.readPresence = bind(this.readPresence, this);
    this.readMessage = bind(this.readMessage, this);
    this.readIq = bind(this.readIq, this);
    this.read = bind(this.read, this);
    this.ping = bind(this.ping, this);
    this.online = bind(this.online, this);
    this.error = bind(this.error, this);
    var base;
    XmppBot.__super__.constructor.call(this, robot);
    this.robot = robot;
    this.anonymousGroupChatWarningLogged = false;
    this.roomToPrivateJID = {};
    if ((base = String.prototype).startsWith == null) {
      base.startsWith = function(s) {
        return this.slice(0, s.length) === s;
      };
    }
  }

  XmppBot.prototype.run = function() {
    var base, options;
    this.anonymousGroupChatWarningLogged = false;
    this.roomToPrivateJID = {};
    if ((base = String.prototype).startsWith == null) {
      base.startsWith = function(s) {
        return this.slice(0, s.length) === s;
      };
    }
    this.checkCanStart();
    options = {
      username: process.env.HUBOT_XMPP_USERNAME,
      password: process.env.HUBOT_XMPP_PASSWORD,
      host: process.env.HUBOT_XMPP_HOST || "127.0.0.1",
      port: process.env.HUBOT_XMPP_PORT || 5222,
      rooms: this.parseRooms("chatbot@conference.chatbot.altran.de".split(',')),
      keepaliveInterval: process.env.HUBOT_XMPP_KEEPALIVE_INTERVAL || 30000,
      reconnectTry: process.env.HUBOT_XMPP_RECONNECT_TRY || 5,
      reconnectWait: process.env.HUBOT_XMPP_RECONNECT_WAIT || 5000,
      legacySSL: process.env.HUBOT_XMPP_LEGACYSSL,
      preferredSaslMechanism: 'PLAIN',
      disallowTLS: 0,
      pmAddPrefix: process.env.HUBOT_XMPP_PM_ADD_PREFIX
    };
    this.robot.logger.info(util.inspect(options));
    options.password = process.env.HUBOT_XMPP_PASSWORD;
    this.options = options;
    this.connected = false;
    return this.makeClient();
  };

  XmppBot.prototype.reconnect = function() {
    var options;
    options = this.options;
    this.reconnectTryCount += 1;
    if (this.reconnectTryCount > options.reconnectTry) {
      this.robot.logger.error('Unable to reconnect to jabber server dying.');
      process.exit(1);
    }
    this.client.removeListener('error', this.error);
    this.client.removeListener('online', this.online);
    this.client.removeListener('offline', this.offline);
    this.client.removeListener('stanza', this.read);
    return setTimeout((function(_this) {
      return function() {
        return _this.makeClient();
      };
    })(this), options.reconnectWait);
  };

  XmppBot.prototype.makeClient = function() {
    var options;
    options = this.options;
    this.client = new Client({
      reconnect: true,
      jid: options.username,
      password: options.password,
      host: options.host,
      port: options.port,
      legacySSL: options.legacySSL,
      preferredSaslMechanism: options.preferredSaslMechanism,
      disallowTLS: options.disallowTLS
    });
    return this.configClient(options);
  };

  XmppBot.prototype.configClient = function(options) {
    this.client.connection.socket.setTimeout(0);
    setInterval(this.ping, options.keepaliveInterval);
    this.client.on('error', this.error);
    this.client.on('online', this.online);
    this.client.on('offline', this.offline);
    this.client.on('stanza', this.read);
    return this.client.on('end', (function(_this) {
      return function() {
        _this.robot.logger.info('Connection closed, attempting to reconnect');
        return _this.reconnect();
      };
    })(this));
  };

  XmppBot.prototype.error = function(error) {
    return this.robot.logger.error("Received error " + (error.toString()));
  };

  XmppBot.prototype.online = function() {
    var i, len, presence, ref2, room;
    this.robot.logger.info('Hubot XMPP client online');
    this.client.connection.socket.setTimeout(0);
    this.client.connection.socket.setKeepAlive(true, this.options.keepaliveInterval);
    presence = new Stanza('presence');
    presence.c('nick', {
      xmlns: 'http://jabber.org/protocol/nick'
    }).t(this.robot.name);
    this.client.send(presence);
    this.robot.logger.info('Hubot XMPP sent initial presence');
    ref2 = this.options.rooms;
    for (i = 0, len = ref2.length; i < len; i++) {
      room = ref2[i];
      this.joinRoom(room);
    }
    this.emit(this.connected ? 'reconnected' : 'connected');
    this.connected = true;
    return this.reconnectTryCount = 0;
  };

  XmppBot.prototype.ping = function() {
    var ping;
    ping = new Stanza('iq', {
      type: 'get',
      id: this.currentIqId++
    });
    ping.c('ping', {
      xmlns: 'urn:xmpp:ping'
    });
    this.robot.logger.debug("[sending ping] " + ping);
    return this.client.send(ping);
  };

  XmppBot.prototype.parseRooms = function(items) {
    var i, index, len, room, rooms;
    rooms = [];
    for (i = 0, len = items.length; i < len; i++) {
      room = items[i];
      index = room.indexOf(':');
      rooms.push({
        jid: room.slice(0, index > 0 ? index : room.length),
        password: index > 0 ? room.slice(index + 1) : false
      });
    }
    return rooms;
  };

  XmppBot.prototype.joinRoom = function(room) {
    var params, room_id;
    this.client.send((function(_this) {
      return function() {
        var el, x;
        _this.robot.logger.debug("Joining " + room.jid + "/" + _this.robot.name);
        el = new Stanza('presence', {
          to: room.jid + "/" + _this.robot.name
        });
        x = el.c('x', {
          xmlns: 'http://jabber.org/protocol/muc'
        });
        x.c('history', {
          seconds: 1
        });
        if (room.password) {
          x.c('password').t(room.password);
        }
        return x;
      };
    })(this)());
    if (process.env.HUBOT_XMPP_UUID_ON_JOIN != null) {
      room_id = uuid.v4();
      params = {
        to: room.jid,
        type: 'groupchat'
      };
      this.robot.logger.info("Joining " + room.jid + " with " + room_id);
      this.joining[room_id] = room.jid;
      return this.client.send(new Stanza('message', params).c('body').t(room_id));
    }
  };

  XmppBot.prototype.leaveRoom = function(room) {
    var i, index, joined, len, ref2;
    ref2 = this.options.rooms;
    for (index = i = 0, len = ref2.length; i < len; index = ++i) {
      joined = ref2[index];
      if (joined.jid === room.jid) {
        this.options.rooms.splice(index, 1);
      }
    }
    return this.client.send((function(_this) {
      return function() {
        _this.robot.logger.debug("Leaving " + room.jid + "/" + _this.robot.name);
        return new Stanza('presence', {
          to: room.jid + "/" + _this.robot.name,
          type: 'unavailable'
        });
      };
    })(this)());
  };

  XmppBot.prototype.getUsersInRoom = function(room, callback, requestId) {
    if (!requestId) {
      requestId = 'get_users_in_room_' + Date.now() + Math.random().toString(36).slice(2);
    }
    this.client.send((function(_this) {
      return function() {
        var message;
        _this.robot.logger.debug("Fetching users in the room " + room.jid);
        message = new Stanza('iq', {
          from: _this.options.username,
          id: requestId,
          to: room.jid,
          type: 'get'
        });
        message.c('query', {
          xmlns: 'http://jabber.org/protocol/disco#items'
        });
        return message;
      };
    })(this)());
    return this.once("completedRequest" + requestId, callback);
  };

  XmppBot.prototype.sendInvite = function(room, invitee, reason) {
    return this.client.send((function(_this) {
      return function() {
        var message;
        _this.robot.logger.debug("Inviting " + invitee + " to " + room.jid);
        message = new Stanza('message', {
          to: invitee
        });
        message.c('x', {
          xmlns: 'jabber:x:conference',
          jid: room.jid,
          reason: reason
        });
        return message;
      };
    })(this)());
  };

  XmppBot.prototype.read = function(stanza) {
    if (stanza.attrs.type === 'error') {
      this.robot.logger.error('[xmpp error]' + stanza);
      return;
    }
    switch (stanza.name) {
      case 'message':
        return this.readMessage(stanza);
      case 'presence':
        return this.readPresence(stanza);
      case 'iq':
        return this.readIq(stanza);
    }
  };

  XmppBot.prototype.readIq = function(stanza) {
    var item, pong, ref2, roomJID, userItems, usersInRoom;
    this.robot.logger.debug("[received iq] " + stanza);
    if (stanza.attrs.type === 'get' && stanza.children[0].name === 'ping') {
      pong = new Stanza('iq', {
        to: stanza.attrs.from,
        from: stanza.attrs.to,
        type: 'result',
        id: stanza.attrs.id
      });
      this.robot.logger.debug("[sending pong] " + pong);
      return this.client.send(pong);
    } else if (((ref2 = stanza.attrs.id) != null ? ref2.startsWith('get_users_in_room') : void 0) && stanza.children[0].children) {
      roomJID = stanza.attrs.from;
      userItems = stanza.children[0].children;
      usersInRoom = (function() {
        var i, len, results;
        results = [];
        for (i = 0, len = userItems.length; i < len; i++) {
          item = userItems[i];
          results.push(item.attrs.name);
        }
        return results;
      })();
      this.robot.logger.debug("[users in room] " + roomJID + " has " + usersInRoom);
      return this.emit("completedRequest" + stanza.attrs.id, usersInRoom);
    }
  };

  XmppBot.prototype.readMessage = function(stanza) {
    var body, from, message, privateChatJID, ref2, ref3, ref4, ref5, room, user;
    if ((ref2 = stanza.attrs.type) !== 'groupchat' && ref2 !== 'direct' && ref2 !== 'chat') {
      return;
    }
    if (stanza.attrs.from === void 0) {
      return;
    }
    body = stanza.getChild('body');
    if (!body) {
      return;
    }
    from = stanza.attrs.from;
    message = body.getText();
    if ((process.env.HUBOT_XMPP_UUID_ON_JOIN != null) && message in this.joining) {
      this.robot.logger.info("Now accepting messages from " + this.joining[message]);
      this.joined.push(this.joining[message]);
    }
    if (stanza.attrs.type === 'groupchat') {
      ref3 = from.split('/'), room = ref3[0], user = ref3[1];
      if (user === void 0 || user === "" || user === this.robot.name) {
        return;
      }
      privateChatJID = this.roomToPrivateJID[from];
    } else {
      user = from.split('@')[0];
      user = user;
      room = "undefined";
      privateChatJID = from;
      if (this.options.pmAddPrefix && message.slice(0, this.robot.name.length).toLowerCase() !== this.robot.name.toLowerCase() && message.slice(0, (ref4 = process.env.HUBOT_ALIAS) != null ? ref4.length : void 0).toLowerCase() !== ((ref5 = process.env.HUBOT_ALIAS) != null ? ref5.toLowerCase() : void 0)) {
        message = this.robot.name + " " + message;
      }
    }
    user = this.robot.brain.userForId(user);
    user.type = stanza.attrs.type;
    user.room = room;
    if (privateChatJID) {
      user.privateChatJID = privateChatJID;
    }
    return this.receive(new TextMessage(user, message));
  };

  XmppBot.prototype.readPresence = function(stanza) {
    var base, fromJID, privateChatJID, ref2, ref3, room, user;
    fromJID = new JID(stanza.attrs.from);
    if ((base = stanza.attrs).type == null) {
      base.type = 'available';
    }
    switch (stanza.attrs.type) {
      case 'subscribe':
        this.robot.logger.debug(stanza.attrs.from + " subscribed to me");
        return this.client.send(new Stanza('presence', {
          from: stanza.attrs.to,
          to: stanza.attrs.from,
          id: stanza.attrs.id,
          type: 'subscribed'
        }));
      case 'probe':
        this.robot.logger.debug(stanza.attrs.from + " probed me");
        return this.client.send(new Stanza('presence', {
          from: stanza.attrs.to,
          to: stanza.attrs.from,
          id: stanza.attrs.id
        }));
      case 'available':
        if (fromJID.resource === this.robot.name || (typeof stanza.getChild === "function" ? (ref2 = stanza.getChild('nick')) != null ? typeof ref2.getText === "function" ? ref2.getText() : void 0 : void 0 : void 0) === this.robot.name) {
          this.heardOwnPresence = true;
          return;
        }
        room = fromJID.bare().toString();
        if (!this.messageFromRoom(room)) {
          return;
        }
        privateChatJID = this.resolvePrivateJID(stanza);
        this.roomToPrivateJID[fromJID.toString()] = privateChatJID != null ? privateChatJID.toString() : void 0;
        this.robot.logger.debug("Available received from " + (fromJID.toString()) + " in room " + room + " and private chat jid is " + (privateChatJID != null ? privateChatJID.toString() : void 0));
        user = this.robot.brain.userForId(fromJID.resource, {
          room: room,
          jid: fromJID.toString(),
          privateChatJID: privateChatJID != null ? privateChatJID.toString() : void 0
        });
        if (!!this.heardOwnPresence) {
          return this.receive(new EnterMessage(user));
        }
        break;
      case 'unavailable':
        ref3 = stanza.attrs.from.split('/'), room = ref3[0], user = ref3[1];
        if (!this.messageFromRoom(room)) {
          return;
        }
        if (user === this.options.username) {
          return;
        }
        this.robot.logger.debug("Unavailable received from " + user + " in room " + room);
        user = this.robot.brain.userForId(user, {
          room: room
        });
        return this.receive(new LeaveMessage(user));
    }
  };

  XmppBot.prototype.resolvePrivateJID = function(stanza) {
    var jid, privateJID, ref2, ref3, ref4;
    jid = new JID(stanza.attrs.from);
    privateJID = (ref2 = stanza.getChild('x', 'http://jabber.org/protocol/muc#user')) != null ? typeof ref2.getChild === "function" ? (ref3 = ref2.getChild('item')) != null ? (ref4 = ref3.attrs) != null ? ref4.jid : void 0 : void 0 : void 0 : void 0;
    if (!privateJID) {
      if (!this.anonymousGroupChatWarningLogged) {
        this.robot.logger.warning("Could not get private JID from group chat. Make sure the server is configured to broadcast real jid for groupchat (see http://xmpp.org/extensions/xep-0045.html#enter-nonanon)");
        this.anonymousGroupChatWarningLogged = true;
      }
      return null;
    }
    return new JID(privateJID);
  };

  XmppBot.prototype.messageFromRoom = function(room) {
    var i, joined, len, ref2;
    ref2 = this.options.rooms;
    for (i = 0, len = ref2.length; i < len; i++) {
      joined = ref2[i];
      if (joined.jid.toUpperCase() === room.toUpperCase()) {
        return true;
      }
    }
    return false;
  };

  XmppBot.prototype.send = function() {
    var base, base1, bodyMsg, envelope, i, len, message, messageBody, msg, params, parsedMsg, ref2, ref3, ref4, ref5, results, strings, to;
    envelope = arguments[0], strings = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    results = [];
    for (i = 0, len = strings.length; i < len; i++) {
      msg = strings[i];
      to = "";
      if (msg instanceof Object && msg.to) {
        to = msg.to;
      } else {
        to = envelope.room;
        if ((ref2 = (ref3 = envelope.user) != null ? ref3.type : void 0) === 'direct' || ref2 === 'chat') {
          to = (ref4 = envelope.user.privateChatJID) != null ? ref4 : envelope.room + "/" + envelope.user.name;
        }
      }
      params = {
        to: to,
        type: ((ref5 = envelope.user) != null ? ref5.type : void 0) || 'groupchat'
      };
      if (msg instanceof Element) {
        message = msg.root();
        if ((base = message.attrs).to == null) {
          base.to = params.to;
        }
        if ((base1 = message.attrs).type == null) {
          base1.type = params.type;
        }
      } else {
        parsedMsg = (function() {
          try {
            return parse(msg);
          } catch (_error) {}
        })();
        messageBody = "";
        if (msg instanceof Object && msg.text) {
          messageBody = msg.text;
        } else {
          messageBody = msg;
        }
        bodyMsg = new Stanza('message', params).c('body').t(messageBody);
        message = parsedMsg != null ? bodyMsg.up().c('html', {
          xmlns: 'http://jabber.org/protocol/xhtml-im'
        }).c('body', {
          xmlns: 'http://www.w3.org/1999/xhtml'
        }).cnode(parsedMsg) : bodyMsg;
      }
      results.push(this.client.send(message));
    }
    return results;
  };

  XmppBot.prototype.reply = function() {
    var envelope, i, len, messages, msg, results;
    envelope = arguments[0], messages = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    results = [];
    for (i = 0, len = messages.length; i < len; i++) {
      msg = messages[i];
      if (msg instanceof Element) {
        results.push(this.send(envelope, msg));
      } else {
        results.push(this.send(envelope, envelope.user.name + ": " + msg));
      }
    }
    return results;
  };

  XmppBot.prototype.topic = function() {
    var envelope, message, string, strings;
    envelope = arguments[0], strings = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    string = strings.join("\n");
    message = new Stanza('message', {
      to: envelope.room,
      type: envelope.user.type
    }).c('subject').t(string);
    return this.client.send(message);
  };

  XmppBot.prototype.offline = function() {
    return this.robot.logger.debug("Received offline event");
  };

  XmppBot.prototype.checkCanStart = function() {};

  return XmppBot;

})(Adapter);

exports.use = function(robot) {
  robot.logger.info("hello world");
  return new XmppBot(robot);
};
