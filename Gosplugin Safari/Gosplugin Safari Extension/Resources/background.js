console.debug("%cgosuslugi.plugin.extension.background load", "font-weight: bold;");


import { meta } from '/includes/_core/meta.js'

import '/includes/_core/error_handler.js'

import '/includes/lib/base64.js'

import '/includes/formats.js'
import '/includes/bootstrap.js'
var __NMA_TAB_ACK = true;
// ===== Safari native transport (NMA) =====
// Safari не пускает расширения на 127.0.0.1, поэтому всё идёт через модуль расширения:
// sendNativeMessage -> SafariWebExtensionHandler -> HTTP 127.0.0.1 -> мост приложения -> native host.
//
// Safari выполняет обращения расширения к модулю строго по одному, поэтому:
//  * запрос и ответ — одно обращение (send ждёт ответ плагина до SEND_WAIT секунд);
//  * опрос (poll) — только если ответ ещё не пришёл (например, пока вводят PIN), короткими
//    интервалами, чтобы не задерживать запросы других вкладок.
var __NT_SEND = chrome.runtime["sendNativeMessage"].bind(chrome.runtime);
function __diag(t) { try { __NT_SEND("nma", { diag: String(t).slice(0, 1500) }, function () {}); } catch (e) {} }
function __ntCall(msg) {
	return new Promise(function (res, rej) {
		try {
			__NT_SEND("nma", msg, function (r) {
				if (!r) return rej(new Error("no native response"));
				if (r.error && msg.op === "open") return rej(new Error(r.error));
				res(r);
			});
		} catch (e) { rej(e); }
	});
}
function __reqKey(m) {
	if (!m || typeof m !== "object") return null;
	if (m.commandId !== undefined && m.commandId !== null) return "c:" + m.sessionId + ":" + m.commandId;
	if (m.id !== undefined && m.id !== null && !m.isChunked) return "i:" + m.id;
	// КриптоПро: {tabid, data:{requestid}} и части ответа {tabid, requestid, partial}
	if (m.tabid && m.data && m.data.requestid !== undefined) return "r:" + m.tabid + ":" + m.data.requestid;
	if (m.tabid && m.requestid !== undefined && m.partial === -1) return "r:" + m.tabid + ":" + m.requestid;
	return null;
}
function __nativeConnect(name) {
	var msgL = [], discL = [], closed = false, sid = null, opening = null, chain = Promise.resolve(), port;
	var outstanding = {}, polling = false;
	var SEND_WAIT = 8, POLL_WAIT = 0.5, MAX_WAIT = 180000;

	function nOutstanding() { return Object.keys(outstanding).length; }
	function deliver(list) {
		(list || []).forEach(function (m) {
			var k = __reqKey(m);
			// ответ, пришедший частями: Контур — isChunked/isFinalChunk, КриптоПро — partial, Госплагин — meta.data.chunk/chunks
			var d = m && m.meta && m.meta.data;
			var partial = (m && m.isChunked && !m.isFinalChunk) || (m && m.partial > 0) ||
				(d && d.chunks && String(d.chunks) !== "1" && String(d.chunk) !== String(d.chunks));
			if (k && outstanding[k] && !partial) delete outstanding[k];
			msgL.forEach(function (f) { try { f(m, port); } catch (e) { console.error(e); } });
		});
	}
	function fireDisc(why) {
		if (closed) return;
		closed = true;
		if (why) __diag(name + " disconnect: " + why);
		discL.forEach(function (f) { try { f(port); } catch (e) { console.error(e); } });
	}
	function needPoll() {
		if (closed || !sid) return false;
		if (nOutstanding() === 0) return false;
		// ждём ответ (например, пока пользователь вводит PIN), но не вечно
		var oldest = Math.min.apply(null, Object.keys(outstanding).map(function (k) { return outstanding[k]; }));
		return Date.now() - oldest < MAX_WAIT;
	}
	function poll() {
		if (polling || !needPoll()) return;
		polling = true;
		__ntCall({ op: "poll", sid: sid, wait: POLL_WAIT }).then(function (r) {
			polling = false;
			deliver(r.msgs);
			if (r.closed || r.error) { fireDisc(r.error || "host closed"); return; }
			poll();
		}).catch(function (e) { polling = false; fireDisc("poll " + e.message); });
	}
	function ensureOpen() {
		if (!opening) {
			// сразу после входа в систему мост может ещё запускаться — пробуем до ~60 с
			var deadline = Date.now() + 60000;
			var attempt = function () {
				return __ntCall({ op: "open", host: name }).then(function (r) { sid = r.sid; }, function (e) {
					if (closed || Date.now() > deadline || !/мост не отвечает|timeout/i.test(e.message)) throw e;
					return new Promise(function (res) { setTimeout(res, 2000); }).then(attempt);
				});
			};
			opening = attempt();
			opening.catch(function (e) { fireDisc("open " + e.message); });
		}
		return opening;
	}
	function send(text, key) {
		chain = chain.then(function () { return ensureOpen(); }).then(function () {
			if (closed) return;
			if (key) outstanding[key] = Date.now();
			return __ntCall({ op: "send", sid: sid, data: text, wait: key ? SEND_WAIT : 0 }).then(function (r) {
				deliver(r.msgs);
				if (r.closed || r.error) { fireDisc(r.error || "host closed"); return; }
				poll();
			});
		}).catch(function (e) { fireDisc("send " + e.message); });
	}
	port = {
		name: name,
		onMessage: {
			addListener: function (f) { msgL.push(f); },
			removeListener: function (f) { msgL = msgL.filter(function (x) { return x !== f; }); },
			hasListener: function (f) { return msgL.indexOf(f) >= 0; }
		},
		onDisconnect: {
			addListener: function (f) { discL.push(f); },
			removeListener: function (f) { discL = discL.filter(function (x) { return x !== f; }); },
			hasListener: function (f) { return discL.indexOf(f) >= 0; }
		},
		postMessage: function (m) {
			if (closed) throw new Error("Attempting to use a disconnected port object");
			send(JSON.stringify(m), __reqKey(m));
		},
		disconnect: function () {
			if (closed) return;
			closed = true;
			if (sid) __ntCall({ op: "close", sid: sid }).catch(function () {});
		}
	};
	return port;
}
function __nativeSendOnce(name, msg, cb) {
	var p = __nativeConnect(name), done = false;
	function finish(r) { if (done) return; done = true; try { p.disconnect(); } catch (e) {} if (cb) cb(r); }
	p.onMessage.addListener(function (m) { finish(m); });
	p.onDisconnect.addListener(function () { finish(undefined); });
	p.postMessage(msg);
	setTimeout(function () { finish(undefined); }, 75000); // с запасом на запуск моста
}
// Safari после перезапуска восстанавливает вкладки раньше, чем запускается расширение,
// и tabs.sendMessage для них падает с «Tab not found». Тогда шлём ответ во все вкладки —
// страница сама отбросит чужие сообщения по id.
(function () {
	try {
		var orig = chrome.tabs && chrome.tabs.sendMessage && chrome.tabs.sendMessage.bind(chrome.tabs);
		if (!orig) return;
		function broadcast(tabId, msg) {
			chrome.tabs.query({}, function (tabs) {
				(tabs || []).forEach(function (t) {
					if (t.id === tabId || !/^https:/.test(t.url || "")) return;
					try { var q = orig(t.id, msg); if (q && q.catch) q.catch(function () {}); } catch (e) {}
				});
			});
		}
		// Иногда Safari теряет связь расширения с конкретной вкладкой: sendMessage не падает,
		// но сообщение до страницы не доходит (лечилось только новой вкладкой). Если контент-скрипт
		// умеет подтверждать получение (__NMA_TAB_ACK — Госплагин отвечает sendResponse(null)),
		// ждём подтверждение и без него тоже рассылаем во все вкладки.
		var ACK_WAIT = 1500;
		chrome.tabs.sendMessage = function (tabId, msg) {
			var p, acked = false, done = false;
			function fallback(why) {
				if (done) return; done = true;
				__diag("tabs.sendMessage: " + why + " — шлю во все вкладки");
				broadcast(tabId, msg);
			}
			try { p = orig.apply(null, arguments); }
			catch (e) { fallback(e.message); return Promise.resolve(); }
			if (typeof __NMA_TAB_ACK !== "undefined") {
				setTimeout(function () { if (!acked) fallback("вкладка " + tabId + " не подтвердила получение"); }, ACK_WAIT);
			}
			if (p && p.then) {
				return p.then(function (r) {
					if (r !== undefined) acked = true;
					return r;
				}, function (e) { fallback(e && e.message); });
			}
			return p;
		};
	} catch (e) {}
})();
self.addEventListener("error", function (e) { __diag("bg error: " + e.message + " @" + e.filename + ":" + e.lineno); });
self.addEventListener("unhandledrejection", function (e) { __diag("bg rejection: " + ((e.reason && e.reason.message) || e.reason)); });
__diag("bg start " + chrome.runtime.getManifest().version);
// ===== end NMA =====



let background = (function () {
    const _ID = "gosuslugi.plugin.extension.background";
    const _EOF = "-1";
    
    const _CONFIG_MESSAGE  = new _formats_0db7d9ec48754f9080a77e237238453b.GosuslugiPluginMessage(_ID, "system", "config" );
    const _INSTALL_MESSAGE = new _formats_0db7d9ec48754f9080a77e237238453b.GosuslugiPluginMessage(_ID, "system", "install");

    const _OS = function () {
        let userAgent = navigator.userAgent.toLowerCase(),
            macosPlatforms = /(macintosh|macintel|macppc|mac68k|macos)/i,
            windowsPlatforms = /(win32|win64|windows|wince)/i,
            iosPlatforms = /(iphone|ipad|ipod)/i;

        if (macosPlatforms.test(userAgent)) return "macos";
        if (iosPlatforms.test(userAgent)) return "ios";
        if (windowsPlatforms.test(userAgent)) return "windows";
        if (/android/.test(userAgent)) return "android";

        return "linux";
    }();

    const _BROWSER = function () {
        let result = "undefined";

        let userAgent = navigator.userAgent.toLowerCase();
		
        if (userAgent.includes('safari') && userAgent.includes('mac') && !userAgent.includes('chrome')) {
            result = "safari";
        }
        else if (userAgent.includes('chrome') || userAgent.includes('edge')) {
            result = "chrome";
        }
		else if (userAgent.includes('yabrowser')) {
            result = "opera";
        }
        else if (userAgent.includes('mozilla')) {
            result = "mozilla";
        }

        return result;
    }();

    const _META = JSON.parse(meta);

    const _LINK = _META.find(item => 
      item.format.type === _OS && item.format.category === "link"
    )?.data;

    const _CHUNK_SUPPORT_MINIMUM_EXTENSION_VERSION = _META.find(item => 
      item.format.type === "chunk" && item.format.category === "version"
    )?.data;

    const _MAX_CHUNKS_COUNT_FOR_DISCONNECT = +_META.find(item => 
      item.format.type === "chunkCountForDisconnect" && item.format.category === "alarm"
    )?.data;

    const _CHROME_MINIMUM_NOTIFICATION_PROMISE_VERSION = +_META.find(item => 
      item.format.type === "chromeMinimumNotificationPromise" && item.format.category === "version"
    )?.data;

    const _PROTOCOL_USER_STATE = 1000;

    const _PROTOCOL_STATES = Object.freeze({
        CONNECTING:                           0,
        OPEN:                                 1,
        CLOSING:                              2,
        CLOSED:                               3,

        UNINITIALIZED: _PROTOCOL_USER_STATE + 1,
        LOST:          _PROTOCOL_USER_STATE + 2
    });
    
    let ignoredIds = new Set();

    let chunksCounter = "0";

    let _handle = null;

    let _state = _PROTOCOL_STATES.UNINITIALIZED;

    let _extensionVersion = "";
    let _minSupportedVersion = "";
    let _programVersion = "";
	
    let _installData = function (reason) {
    	
        _extensionVersion = _META.find(item => 
          item.format.type === "release" && item.format.category === "version"
        )?.data;
        _minSupportedVersion = _META.find(item => 
          item.format.type === "min" && item.format.category === "version"
        )?.data;
        
        console.info(_ID + " actualized extension info, reason: " + reason + ", release version: " + _extensionVersion + ", min version: " + _minSupportedVersion);
        
        return { reason: reason, update: {"link": _LINK, "release": _extensionVersion, "min": _minSupportedVersion } };	
    }

    let _chunks = {};
    let _install = _installData("initialize");
    let _messages = {};

    let _base64_transform_if = function( message, encode = true ) {
        try
        {
            const transferEncoding = message.meta.content.transferEncoding;
            const operationPrefix = encode ? "encode to" : "decode from";

            if (transferEncoding) {
                if (transferEncoding == "base64") {
                    const messageData = message.mode == "debug" ? JSON.stringify(message) : message.id;
                    const operationMessage = _ID + " " + operationPrefix + " : " + messageData;

                    console.info(operationMessage);

                    if( encode ) message.method.data   = Base64.encode(message.method.data  );
                    else         message.method.result = Base64.decode(message.method.result);
                }
            }
        }
        catch (e) {
            message.error = _ID + ":\ncontent transfer encoding failed, reason:\n" + e.result;
        }
    };

    let _protocol_state_to_string = function (state) {
        const STATES = {
            [_PROTOCOL_STATES.CONNECTING]:    'CONNECTING',
            [_PROTOCOL_STATES.OPEN]:          'OPEN',
            [_PROTOCOL_STATES.CLOSING]:       'CLOSING',
            [_PROTOCOL_STATES.CLOSED]:        'CLOSED',
            [_PROTOCOL_STATES.UNINITIALIZED]: 'UNINITIALIZED',
            [_PROTOCOL_STATES.LOST]:          'LOST',
        };
        return STATES[state] || String(state);
    };

    let _protocol_switch_state = function (protocol, prev, current) {
        if( prev != current ) {
            console.info(protocol + " switch state" + 
                " from: " + _protocol_state_to_string(prev) + 
                " to: "   + _protocol_state_to_string(current));

            /*
                todo: 
                    оставлено для отладки
            */
            /*
            switch (current) {
                case _PROTOCOL_STATES.OPEN: 
                    _notify('info', `${_protocol.format().type} соединение установлено`);
                    break;
                case _PROTOCOL_STATES.LOST: 
                    if (prev == _PROTOCOL_STATES.OPEN) _notify('info', `${_protocol.format().type} соединение прервано`);
                    else if (prev != _PROTOCOL_STATES.UNINITIALIZED) _notify('error', `ошибка установки ${_protocol.format().type} соединения`);
                    break;
                case _PROTOCOL_STATES.UNINITIALIZED: 
                    if (prev == _PROTOCOL_STATES.CONNECTING) _notify('error', `ошибка установки ${_protocol.format().type} соединения`);                    else                               
                    break;
                default:;
            };
            */

            prev = current;
        }

        return prev;
    };

    let _join = function(message){
        const chunk = message?.meta?.data?.chunk || "";
        const chunks = message?.meta?.data?.chunks || "";
        const single = !chunks || chunks == "" || chunks == "1";

        if (single) {
            if (message.mode == "debug") console.info(_ID + " join missed, id: " + message.id + ", chunks: " + chunks);
            return message;
        }

        if (!_chunks.hasOwnProperty(message.id)) {
            _chunks[message.id] = [];
        }

        _chunks[message.id].push(message.method.result);

        if (_chunks[message.id].length === parseInt(chunks, 10)) {

            let result = _chunks[message.id].join("");

            delete _chunks[message.id];

            ((message.meta ??= {}).data ??= {}).chunk = "";
            ((message.meta ??= {}).data ??= {}).chunks = "";

            message.method.result = result;

            if (message.mode == "debug") console.info(_ID + " join finished, id: " + message.id + ", chunks: " + chunks);

            return message;
        }

        if (message.mode == "debug") console.info(_ID + " join pushed, id: " + message.id + ", chunk: " + chunk + ", chunks: " + chunks);

        return null;
    };

    let nmh = (function () {
        const _ID = "gosuslugi.plugin.extension.nmh";

        const _HOST = "chrome.gosuslugi.plugin";
        const _OBSOLETE_HOST = "gosuslugi.plugin";

        const _MAXIMUM_MESSAGE_SIZE = 1024 * 1024;

        let _host = _HOST;

        let _code_to_protocol_state = function (code) {
            switch (code) {
                case error_handler.ERRORS.PROTOCOL_NATIVE_HOST_LOST.code:      return _PROTOCOL_STATES.LOST;
                case error_handler.ERRORS.PROTOCOL_NATIVE_HOST_NOT_FOUND.code: return _PROTOCOL_STATES.UNINITIALIZED;
                default:                                                       return _PROTOCOL_STATES.CLOSED;
            };
        };

        let _connected = function () {
            return !!_handle;
        };

        let _connect = function () {
            if (_connected()) {
                // nothing to do
            }
            else {
                console.info(_ID + " try connect to " + _host);

                _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.CONNECTING);
                _handle = __nativeConnect(_host);
                _messages = {};
                
                if (_connected()) {
                    _handle.onMessage.addListener(function (message) {

                        _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.OPEN);
                        delete _messages[message.id];

                        if (message.mode == "debug") console.info(_ID + " response: " + JSON.stringify(message));
                        else console.info(_ID + " response id: " + message.id);

                        let result = _join(message);

                        if (!!result) {
                            _base64_transform_if(result, false);
                            background.response(result);
                        }
                    });
                    _handle.onDisconnect.addListener(function () {
                        _disconnect();
                    });
                };
            }
        };

        let _disconnect = function () {    
            if (_connected()) {

                const lastError = 
                       chrome.runtime.lastError?.message
                    || chrome.runtime.lastError;

                const fallbackCode = !lastError 
                    && ("mozilla" == _BROWSER) 
                    && ("install" == _install?.reason);
                       
                const code = fallbackCode 
                  ? error_handler.ERRORS.PROTOCOL_NATIVE_HOST_NOT_FOUND.code 
                  : error_handler.text_to_code(lastError);

                if (fallbackCode) {
                    console.info(_ID + " nmh fallback code detected");
                }

                console.info(_ID + " nmh connection interrupted" + (lastError ? ", reason: " + lastError : ""));
                _state = _protocol_switch_state(_ID, _state, _code_to_protocol_state(code));

                Object.entries(_messages).forEach(([_, message]) => {
                    error_handler.set_message_error(message,code);
                    _response(message);
                });

                _handle.disconnect();
                _handle = null;

                _messages = {};
                _chunks = {};
            }
            else {
                console.info(_ID + " allready disconnected");
            }
        };

        let _post = function (message) {
            if (_connected()) {
                if (message.mode == "debug") console.info(_ID + " send: " + JSON.stringify(message));
                else console.info(_ID + " send id: " + message.id);

                _handle.postMessage(message);
                message.method.data = null;
                _messages[message.id] = message;
            }
            else {
                throw "<b>connection error</b>";
            }
        };

        return {
            name: function() {
                return _ID;
            },

            format: function() {
                return {
                    "category": "protocol",
                    "type": "nmh",
                    "description": _HOST,
                    "version": ""
                };
            },

            connect: function() {
                return _connect();
            },

            connected: function() {
                return _connected();
            },

            init: function () {
                __nativeSendOnce(_host, _CONFIG_MESSAGE, function (response) {
                    if (chrome.runtime.lastError) {
                        __nativeSendOnce(_OBSOLETE_HOST, _CONFIG_MESSAGE, function (response) {
                            if (chrome.runtime.lastError) {
                                _actualize("install");
                            }
                            else {
                                _host = _OBSOLETE_HOST;
                                _actualize("load");
                            }
                        });
                    }
                    else {
                        _actualize("load");
                    }
                });
            },

            post: function (message) {
                try {
                    let meta = message.meta;
                    let type = message.method.type;
                    let chunk = meta?.data?.chunk;
                    let firstChunk = !meta || ['1', '', undefined].includes(chunk);
                    let skip = (!firstChunk && !_connected()) || ("disconnect" == type);

                    if( skip ) {
                        message.method.data = null;
                        _messages[message.id] = message;

                        _disconnect();                        
                    }
                    else {
                        _connect();
                        
                        if ("connect" == type) {
                            // nothing to do
                        }
                        else {
                            _post(message);
                        }
                    }
                }
                catch (e) {
                    console.warn(_ID + " " + e.message);
                }
            },
            disconnect: function () {
                _disconnect();
            }
        };
    })();
    
    let ws = ( function() {
        const _ID = "gosuslugi.plugin.extension.ws";

        let _url = _META.find(item => 
            item.format.type === "ws" && item.format.category === "protocol"
        )?.data;

        let _actualized = false;

        let _websocket_to_protocol_state = function (state) {
            const STATES = {
                [WebSocket.CONNECTING]: _PROTOCOL_STATES.CONNECTING,
                [WebSocket.OPEN]:       _PROTOCOL_STATES.OPEN,
                [WebSocket.CLOSING]:    _PROTOCOL_STATES.CLOSING,
                [WebSocket.CLOSED]:     _PROTOCOL_STATES.CLOSED,
            };
            return STATES[state] ?? _PROTOCOL_STATES.UNINITIALIZED;
        };
 
        let _connected = function() {
            let result =  !!_handle;

            if( result ) {
                result = _handle.readyState === WebSocket.OPEN || 
                         _handle.readyState === WebSocket.CONNECTING;
            }

            return result;
        };

        let _connect = function() {
            if( _connected() ) {
                 // nothing to do
            }
            else {
                console.info(_ID + " try connect to " + "_host" + ", " + _url );

                _actualized = false;
                _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.CONNECTING);
                _handle = new WebSocket( _url );

                _handle.onopen = function() {
                    if (!_actualized) {
                        _actualized = true;
                        _actualize("load");
                    };

                     _state = _protocol_switch_state(_ID, _state, _websocket_to_protocol_state(_handle.readyState));

                    Object.entries(_messages).forEach(([_, message]) => {
                        _handle.send( JSON.stringify(message) );
                    });

                    _messages = {};
                };

                _handle.onmessage = function( event ) {
                     
                    let message = JSON.parse( event.data );
                    
                    if (message.mode == "debug") console.info(_ID + " response: " + JSON.stringify(message));
                    else                         console.info(_ID + " response id: " + message.id);
                    
                    let result = _join(message);
                    
                    if (!!result) {
                        _base64_transform_if(result, false);
                        background.response(result);
                    }
                };

                _handle.onclose = function( event ) {
                    console.log(_ID + ` connection closed: wasClean=${event.wasClean} code=${event.code} reason=${event.reason}`);

                    _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.LOST);

                    _disconnect();
                };

                _handle.onerror = function( error ) {
                    if( _connected() ) {
                        console.warn( _ID + " error: " + error.message );
                    }
                    else if (!_actualized) {
                        let exists = false;
                        let callback = () => {
                            if (!exists) {
                                _actualize("install");
                                _actualized = true;                                    
                            }

                            const code = !!exists 
                                ? error_handler.ERRORS.PROTOCOL_WEB_SOCKET_NOT_FOUND.code
                                : error_handler.ERRORS.PROTOCOL_NATIVE_HOST_NOT_FOUND.code;

                            Object.entries(_messages).forEach(([_, message]) => {
                                error_handler.set_message_error(message, code);
                                _response(message);
                            });

                            _messages = {};

                            _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.UNINITIALIZED);
                        };

                        if ("safari" == _BROWSER) {
                            callback();
                        } else {
                            const host = nmh.format().description;
                            const message = { ..._CONFIG_MESSAGE };

                            __nativeSendOnce(host, message, function (response) {
                                exists = !chrome.runtime.lastError;
                                callback();
                            });
                        }                         
                    }
                };
            }
        };

        let _disconnect = function () {
            if (_connected()) {
                console.info(_ID + " disconnect");
		        
                _handle.send(_EOF);
                _handle.close();
                _handle = null;
		        
                _state = _protocol_switch_state(_ID, _state, _PROTOCOL_STATES.UNINITIALIZED);
		        
                _chunks = {};
            }
            else {
                console.info(_ID + " allready disconnect");
            }           
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message || chrome.runtime.lastError;
                console.warn(message);
            }
        };

        let _post = function( message ) {
            if (_connected()) {  
                if( _handle.readyState === WebSocket.OPEN ){
                    if (message.mode == "debug") console.info(_ID + " send: " + JSON.stringify(message));
                    else                         console.info(_ID + " send id: " + message.id);
				    
                    _handle.send( JSON.stringify(message) );

                } else {
                    if (message.mode == "debug") console.info(_ID + " queueing : " + JSON.stringify(message));
                    else                         console.info(_ID + " queueing id: " + message.id);
				
                    _messages[message.id] = message;                 
                }
            }
            else {
                throw ( _ID + " connection error" );
            } 
        };

        return {
            name: function() {
                return _ID;
            },
		    
            format: function() {
                return {
                    "category": "protocol",
                    "type": "ws",
                    "description": _url,
                    "version": ""
                };
            },
		    
            connect: function() {
                return _connect();
            },
		    
            connected: function() {
                return _connected();
            },
		    
            disconnect: function() {
                return _disconnect();
            },
		    
            init: function() {
                const periodsInSeconds = [0, 20, 40];
		    
                periodsInSeconds.forEach(function (delay, index) {
                    setTimeout(function() {
                        chrome.alarms.create(`alarm${index + 1}`, {
                            periodInMinutes: 1
                        });
                    }, delay * 1000);
                });
		    
                chrome.alarms.onAlarm.addListener(function (alarm) {
                    // empty call, just for keeping extension active
                });
		    
                _connect();
            },
		    
            post: function(message) {
                return _post(message);
            }
        };
    })();   

    let _protocol = (() => {
        let result = _OS === "macos" ? "ws" : "nmh";

        const trueValues = new Set([true, "1", "true", "TRUE"]);
        const protocols = _META.filter(item => item.format.category === "protocol");

        result = (1 === protocols.length)
            ? protocols[0].format.type
            : protocols.find(item => trueValues.has(item.default))?.format.type || result;

        console.info(`${_ID} set active protocol: ${result}`);

        return nmh; // Safari: только native messaging через мост
    })();

    let _ban = false;
    let _chunkUnsupportedVersion = false;

    let _config = {};
    let _compareVersions = function (lhs, rhs) {
        if (lhs === rhs) {
            return 0;
        }
        const lhsNumbers = lhs.split(".").map(Number);
        const rhsNumbers = rhs.split(".").map(Number);
        const lhsNumbersLength = lhsNumbers.length;
        const rhsNumbersLength = rhsNumbers.length;
        const minLength = Math.min(lhsNumbersLength, rhsNumbersLength);
        for (let i = 0; i < minLength; i++) {
            if (lhsNumbers[i] !== rhsNumbers[i]) {
                return lhsNumbers[i] > rhsNumbers[i] ? 1 : -1;
            }
        }
        return lhsNumbersLength - rhsNumbersLength;
    };

    let _obsoleteVersion = function () {
        return _programVersion.length && _extensionVersion.length && (_programVersion != _extensionVersion);
    };

    let _unsupportedVersion = function () {
        return _obsoleteVersion() && (_compareVersions(_programVersion, _minSupportedVersion) < 0);
    };

    let _chromePromiseVersion = function () {
        const userAgent = navigator.userAgent.toLowerCase();
        const chromeField = "chrome/";
        const chromePosition = userAgent.indexOf(chromeField) + chromeField.length;
        const maxVersionPosition = userAgent.indexOf(".", chromePosition);
        return Number(userAgent.substring(chromePosition, maxVersionPosition)) >= _CHROME_MINIMUM_NOTIFICATION_PROMISE_VERSION;
    };

    let _request = function (message) {

        const { id, module, method, meta } = message;
        const mandatory = method.type == "config";
        const type = method?.type;
        const chunk  = meta?.data?.chunk || meta?.chunk;
        const chunks = meta?.data?.chunks || meta?.chunks;

        if( chunks != -1 ) {
             chunksCounter = Number(chunksCounter) + Number(chunks);
        }
        const first = ['1', ''].includes(chunk);
        
        if( first ) {
            _ban = Boolean(_unsupportedVersion());
            _chunkUnsupportedVersion = !!_programVersion.length && _compareVersions(_programVersion, _CHUNK_SUPPORT_MINIMUM_EXTENSION_VERSION) < 0;
            ignoredIds.delete( id );

        } else if( ignoredIds.has( id ) ) {
            return;
        }

        const unsupportedChunks = _chunkUnsupportedVersion && type?.startsWith('signature') && !['1', ''].includes(chunks);

        if( unsupportedChunks ) {
            ignoredIds.add( id );            
        }

        if (_ban && !mandatory) {

            console.warn(_ID + " cancelled message id: " + id +
                ", ban: " + _ban +
                ", mandatory: " + mandatory +
                ", programVersion: " + _programVersion +
                ", extensionVersion: " + _extensionVersion +
                ", minSupportedVersion: " + _minSupportedVersion);

            error_handler.set_message_error(message, null, "Работа Госплагина невозможна. Обновите версию приложения");

            _response(message);
            _notify('unsupportedVersion');
        }
        else if( !!unsupportedChunks ) {
            console.warn(_ID + " cancelled message id: " + id +
                ", programVersion: " + _programVersion +
                ", minChunkSupportedVersion: " + _CHUNK_SUPPORT_MINIMUM_EXTENSION_VERSION);

            error_handler.set_message_error(message, null, "Данный режим подписи недоступен. Обновите версию приложения");

            _response(message);
            _notify('unsupportedChunks');
        }
        else {
            if (message.mode == "debug") console.info(_ID + " send to host message: " + JSON.stringify(message));
            else console.info(_ID + " send to host message id: " + id);

             if (message.error && message.error.length) {
                  _notify('error', message.error);
             } else {
                  _notify('beginSend', message);
                  _notify('beginSign', message);

                  _post(message);
             }
        }
    };

    let _response = function (message) {

        const id = message.id;

        if( ignoredIds.has( id ) ) {
            return;
        }

        if( message.error != "" ) {
            ignoredIds.add( id );
        }

        const methodType = message.method.type;
        const _STREAM_SUPPORTED_METHODS = ['signature', 'signatureV2' ,'encrypt', 'decrypt', 'hash'];

        if (methodType == "config") {
            if (message.error && message.error.length) {
                   _config = {};
            }
            else {
                let result = JSON.parse(message.method.result);
                _config = result;

                result.some(function (each) {
                    if (each.type == "core") {

                        _programVersion = each.format.version;

                        console.info(_ID + " actualized program info, programVersion: " + _programVersion);

                        if (_unsupportedVersion()) _notify('unsupportedVersion');
                        else if (_obsoleteVersion()) _notify('upgrade');

                        return true;
                    }
                    return false;
                });
            }

            console.info(_ID + " actualized config info: " + JSON.stringify(_config));

        } else if (_STREAM_SUPPORTED_METHODS.includes(methodType)) {
            if( chunksCounter > _MAX_CHUNKS_COUNT_FOR_DISCONNECT ) {
                chunksCounter=0;

                if( _protocol == nmh ) {
                    _protocol.disconnect();
                }
            }            
        }
        
        if (message.node == "") {
            if (methodType == "config") {
                let result = {};

                result.install = _install;
                result.config = message.method.result.length ? JSON.parse(message.method.result) : [];

                message.method.result = result;
            }
            if (message.mode == "debug") console.info(_ID + " send to popup message: " + JSON.stringify(message));
            else console.info(_ID + " send to popup message id: " + id);
            chrome.runtime.sendMessage(message, (result) => { if (chrome.runtime.lastError) { } });
        } else {
            if (message.mode == "debug") console.info(_ID + " send to tab message, tab id: " + message.node + ", message: " + JSON.stringify(message));
            else console.info(_ID + " send to tab message, tab id: " + message.node + ", message id: " + id);

            _notify('endSign', message);

            try {
                chrome.tabs.sendMessage(+message.node, message);
            } catch (error) {
                error_handler.parse_message_error(message, error);
                chrome.tabs.sendMessage(+message.node, message);
            }
        }
    };

    let _notify = function (reason, message) {

        /*
            избегаем флуда сообщений
              возможно будут сценарии когда необходимо добавить reason = "reset" для очистки _notify[] и
              уведомлять пользователя о необходимости обновить веб-страницу
        */
        if (typeof _notify[reason] === 'undefined' || !!message) {
            _notify[reason] = reason;

            const { method, meta } = message || {};
            const type = method?.type;
            const chunk  = meta?.data?.chunk || meta?.chunk;
            const chunks = meta?.data?.chunks || meta?.chunks;

            const signatureReasons = ['beginSend', 'beginSign', 'endSign'].includes(reason);
            const signatureMethod = type?.startsWith('signature')
                && ['1', '', chunks].includes(chunk);

            /*
                избегаем флуда сообщений при подписании чанками
            */
            if (!signatureMethod && signatureReasons) {
                return;
            }

            let options = {
                type: 'basic',
                iconUrl: 'img/logo/logo_64x64.png',
                title: 'Госплагин',
                message: "",
                priority: 2,
                requireInteraction: true,
            };

            switch (reason) {
                case 'beginSend':
                case 'beginSign':
                case 'endSign':                    
                    const first = ( chunk == '1' ) || ( chunk == '' ); 
                    const last = chunk == chunks;
                    const send = !!message.method.data;

                    const beginSend =  send && first;
                    const beginSign =  send && last;
                    const endSign   = !send && last;

                    options.requireInteraction = false;

                    if      ( beginSend && ( 'beginSend' == reason ) ) options.message = "Передача данных";
                    else if ( beginSign && ( 'beginSign' == reason ) ) options.message = "Начат процесс подписания файла";
                    else if ( endSign   && ( 'endSign'   == reason ) ) {
                         if ( !!message.method.result ) { options.message = "Процесс подписания файла завершен";     }
                         else                           { options.message = message.error; options.title = "Ошибка"; }                    
                    };                    
                    break;
                case 'upgrade':
                    options.message = "Ваша версия Госплагин устарела. Рекомендуется установить новую версию приложения";
                    options.buttons = [{ title: "Скачать обновление" }];
                    break;
                case 'install':
                    options.message = "Для полноценной работы Госплагин необходима установка приложения";
                    options.buttons = [{ title: "Скачать приложение" }];
                    break;
                case 'conflict':
                    options.message = "Работа расширения невозможна. Используется несовместимый узел";
                    break;
                case 'unsupportedVersion':
                    options.message = "Работа Госплагин невозможна. Обновите версию приложения";
                    options.buttons = [{ title: "Скачать обновление" }];
                    break;
                case 'unsupportedChunks':
                    options.message = "Данный режим подписи недоступен. Обновите версию приложения";
                    options.buttons = [{ title: "Скачать обновление" }];
                    break;
                case 'error':
                    console.warn(`${_ID} ${message}`);
                    options.message = message;
                    options.title = "Ошибка";
                    break;
                case 'info':
                    console.info(`${_ID} ${message}`);
                    options.message = message;
                    options.title = "Cообщение";
                    break;

                case 'update':
                    /*
                         игнорируем, тк
                              формируется не только при обновлении расширения, 
                              но также при включении / отключении
                         обновление проверяем через upgrade 
                              при получении версии из нативного приложения
                    */
                    break;
                default:;
            };

            /*
                browser.notifications не поддержан в safari         
            */
            if ("safari" == _BROWSER) {
                return;
            }
            
            /*
                 ограничения по браузерам касающиеся набора полей для options
                 https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/NotificationOptions
            */
            if ('mozilla' == _BROWSER) {
                if ('upgrade' == reason) {
                    options.message = "Ваша версия Госплагин устарела.\nНажмите на окно, чтобы скачать новую версию приложения";
                }
                if ('install' == reason) {
                    options.message = "Для работы Госплагин необходима установка приложения.\nНажмите на окно, чтобы скачать приложение";
                }
                else if ('unsupportedVersion' == reason) {
                    options.message = options.message + ".\nНажмите на окно, чтобы скачать обновление";
                }
                else if ('unsupportedChunks' == reason) {
                    options.message = options.message + ".\nНажмите на окно, чтобы скачать обновление";
                }

                delete options['buttons'];
                delete options['requireInteraction'];
            }

            if ("linux" == _OS) {
                delete options['priority'];
                delete options['requireInteraction'];
            }

            (async () => {
                if (options.message) {
                    const notificationId = await new Promise((resolve) => {
                        chrome.storage.local.get(['notificationId'], (result) => {
                            resolve(result.notificationId || null);
                        });
                    });

                    if (notificationId) {
                        await new Promise((resolve) => {
                            chrome.notifications.clear(notificationId, resolve);
                        });
                    }

                    const callback = notificationId => {
                        chrome.notifications.onButtonClicked.addListener((id) => {
                            if (id === notificationId) {
                                const unsupported = ('mozilla' === _BROWSER) && ('conflict' === reason);
                                const ignore = !!message;

                                if (!unsupported && !ignore) {
                                    chrome.tabs.create({ url: _LINK });
                                }
                            }
                        });

                        chrome.storage.local.set({ notificationId: notificationId });
                    };

                    const usePromise = ('chrome' !== _BROWSER || _chromePromiseVersion());
                    const notificationOptions = usePromise ? [options] : ["", options];

                    chrome.notifications.create(...notificationOptions).then?.(callback) || callback();
                }
            })();
        }
    };

    let _actualize = function (reason) {

        _install = _installData(reason);

        _notify(reason);
    };

    let _post = function(message) {
        try {
             let type = message.method.type;
             let protocol = _protocol.format();

            (message.meta ??= {}).protocol ??= {};
             message.meta.protocol = protocol; 

            switch (type) {
               case 'disconnect':
                    _protocol.disconnect();
                    break;
               case 'protocol':
                    message.method.data = null;
                    message.method.result = JSON.stringify({
                        type: protocol.type,
                        host: protocol.description,
                        state: _protocol_state_to_string(_state)
                    });
                    _response(message);
                    break;
                case 'exists':
                case 'setPrefix':
                    chrome.scripting.executeScript({
                        target: {
                            tabId: +message.node
                        },
                        world: "MAIN",
                        func: (type, data) => {
                            try {
                                const result = _bootstrap_0db7d9ec48754f9080a77e237238453b[type](data);
                                return { result };
                            } catch (error) {
                                return { error: error.message || `${type} failed` };
                            }
                        },
                        args: [type, type == 'setPrefix' ? JSON.parse(message.method.data) : message.method.data],
                    })
                    .then((result) => {
                        const response = result[0]?.result;
                        message.method.data = null;
                        message.method.error = response?.error ?? null;
                        message.method.result = JSON.stringify(response?.result ?? null);
                        _response(message);
                    })
                    .catch(error => {
                        message.method.data = null;
                        message.method.error = error.message;
                        _response(message);
                    });
                    break;
                default:
                   _protocol.connect();

                if ("connect" == type) {
                   // nothing to do
                } else {
                    _base64_transform_if(message, true);

                    if (message.mode == "debug") console.info(_ID + " send: " + JSON.stringify(message));
                    else console.info(_ID + " send id: " + message.id);

                    _protocol.post(message);
                }
            } 
        }
        catch( e ) {
            _notify('error', e.message ? e.message : e );

            error_handler.parse_message_error(message, e);

            _response(message);
        }
    };

    let _init = function () {

        chrome.runtime.onMessage.addListener(
           function (request, sender, sendResponse) {
               let message = request;
               if (sender.tab) {
                   message.node = sender.tab.id.toString();
               } else {
                   message.node = "";
               }
               _request(message);
               sendResponse({message: true});
           }
        );
        
        chrome.runtime.onInstalled.addListener(
            function (details) {
                try {
                    if ('install' != details.reason) {
                        _actualize(details.reason);
                    }
                    return true;
                }
                catch (e) {
                    console.warn(_ID + " " + e.message);
                }
            }
        );

        _protocol.init();
    };

    _init();

    return {
        request: function (message) {
            _request(message);
        },

        response: function (message) {
            _response(message);
        }
    }
})();