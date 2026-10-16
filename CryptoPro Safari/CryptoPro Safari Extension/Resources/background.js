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
		chrome.tabs.sendMessage = function (tabId, msg) {
			var p;
			try { p = orig.apply(null, arguments); }
			catch (e) { __diag("tabs.sendMessage: " + e.message + " — шлю во все вкладки"); broadcast(tabId, msg); return Promise.resolve(); }
			if (p && p.catch) {
				return p.catch(function (e) {
					__diag("tabs.sendMessage: " + (e && e.message) + " — шлю во все вкладки");
					broadcast(tabId, msg);
				});
			}
			return p;
		};
	} catch (e) {}
})();
self.addEventListener("error", function (e) { __diag("bg error: " + e.message + " @" + e.filename + ":" + e.lineno); });
self.addEventListener("unhandledrejection", function (e) { __diag("bg rejection: " + ((e.reason && e.reason.message) || e.reason)); });
__diag("bg start " + chrome.runtime.getManifest().version);
// ===== end NMA =====

var g_content_ports = {};
var g_native_ports = {};
var g_message_collector = {};
var LOG_LEVEL_DEBUG = 4;
var LOG_LEVEL_INFO = 2;
var LOG_LEVEL_ERROR = 1;
var current_log_level = LOG_LEVEL_ERROR;
var g_user_approved_sites = {};

function getFormattedTime() {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function cpcsp_console_log(level, msg) {
    if (level <= current_log_level) {
        const time = getFormattedTime();
        if (level == LOG_LEVEL_DEBUG)
            console.log("[%s] DEBUG: %s", time, msg);
        if (level == LOG_LEVEL_INFO)
            console.info("[%s] INFO: %s", time, msg);
        if (level == LOG_LEVEL_ERROR)
            console.error("[%s] ERROR: %s", time, msg);
        return;
    }
}

function isValidApprovedSite(site) {
    if (g_user_approved_sites[site])
        return Date.now() < g_user_approved_sites[site] + 24 * 60 * 60 * 1000;
    return false;
}

function set_log_level(level){
    current_log_level = level;
    if (current_log_level == LOG_LEVEL_DEBUG)
        cpcsp_console_log(LOG_LEVEL_INFO, "background.js: log_level = DEBUG");
    if (current_log_level == LOG_LEVEL_INFO)
        cpcsp_console_log(LOG_LEVEL_INFO, "background.js: log_level = INFO");
    if (current_log_level == LOG_LEVEL_ERROR)
        cpcsp_console_log(LOG_LEVEL_INFO, "background.js: log_level = ERROR");
}

function sendNativeMessage(msg) {
    try {
        g_native_ports[msg.tabid].postMessage(msg);
        cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Sent native message:" + JSON.stringify(msg));
    }
    catch(err){
        cpcsp_console_log(LOG_LEVEL_ERROR, "background.js: Exception on sending NativeMessage " + err.message);
        g_native_ports[msg.tabid] = null;
        var err_message = {tabid: msg.tabid, data: {requestid: msg.data.requestid,
                          message: "Error sending message to Native Host"},
                          type: "error"};
        g_content_ports[msg.tabid].postMessage(err_message);
    }
}

var isFireFox = navigator.userAgent.match(/Firefox/i);
var isEdge = navigator.userAgent.match(/Edge/i);
if(!isFireFox && !isEdge){
    browserInstance = chrome;
}else {
    browserInstance = browser;
}

function onNativeMessage(message) {
    try {
        if(isEdge) {
            message = JSON.parse(message);
        }
        cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Received native message:" + JSON.stringify(message));
        if (message.partial)
        {
            if(message.partial == 1)
            {
                g_message_collector[message.tabid + ":" + message.requestid] = message.part;
                cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Received native message begin");
                if (isEdge) {
                    partial_messsage = {tabid: message.tabid, data: {requestid: message.requestid, type: "get_part", last_part: message.partial}};
                    sendNativeMessage(partial_messsage);
                }
                return;
            }
            if(message.partial > 1)
            {
                g_message_collector[message.tabid + ":" + message.requestid] += message.part;
                cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Received native message next part");
                if (isEdge) {
                    partial_messsage = {tabid: message.tabid, data: {requestid: message.requestid, type: "get_part", last_part: message.partial}};
                    sendNativeMessage(partial_messsage);
                }
                return;
            }
            if(message.partial == -1)
            {
                g_message_collector[message.tabid + ":" + message.requestid] += message.part;
                cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Received native message end");
                g_content_ports[message.tabid].postMessage(JSON.parse(g_message_collector[message.tabid + ":" + message.requestid]));
                g_message_collector[message.tabid + ":" + message.requestid] = "";
                return;
            }
        }
        if(message.error)
        {
            cpcsp_console_log(LOG_LEVEL_ERROR, "background.js: Received fatal error message from Native Host: " + message.error);
            return;
        }
        if (message.data && message.data.type === "approved_site")
        {
            var site;
            if (!message.data.value.indexOf("add_approved_site:")) {
                site = message.data.value.substring("add_approved_site: ".length);
                g_user_approved_sites[site] = Date.now();
            }
            else if (!message.data.value.indexOf("is_approved_site:")) {
                site = message.data.value.substring("is_approved_site: ".length);
            }
            else {
                cpcsp_console_log(LOG_LEVEL_ERROR, "background.js: Received incorrect approved_site native message:" + JSON.stringify(message));
                return;
            } 

            var isApproved = isValidApprovedSite(site);
            args = new Array();
            arg = { type: typeof isApproved, value: isApproved };
            args.push(arg);
            message.data.params = args;
            g_native_ports[message.tabid].postMessage(message);
            cpcsp_console_log(LOG_LEVEL_DEBUG, "background.js: Sent native message:" + JSON.stringify(message));
            return;
        }
        g_content_ports[message.tabid].postMessage(message);
    }
    catch(err){
        cpcsp_console_log(LOG_LEVEL_ERROR, "background.js: Exception on sending message to content page " + err.message);
        g_content_ports[message.tabid] = null;
    }
}

function connect(_content_port) {
    var hostName = "ru.cryptopro.nmcades";
    cpcsp_console_log(LOG_LEVEL_INFO, "background.js: Connecting to native messaging host" + hostName);
    g_native_ports[_content_port.name] = __nativeConnect(hostName);    
    g_native_ports[_content_port.name].onMessage.addListener(onNativeMessage);
    g_native_ports[_content_port.name].onDisconnect.addListener(function () {
        cpcsp_console_log(LOG_LEVEL_INFO, "background.js: Disconnect Event: " + " tabid " + _content_port.name);
        g_native_ports[_content_port.name] = null;
        if(g_content_ports[_content_port.name])
            g_content_ports[_content_port.name].disconnect(); 
        g_content_ports[_content_port.name] = null;
        browserInstance.action.setIcon({tabId: _content_port.sender.tab.id, path:"icons/status/icon_error_128.png"});
        browserInstance.action.setPopup({tabId: _content_port.sender.tab.id, popup:"popup_error.html"});
    });
    return true;
}

browserInstance.runtime.onConnect.addListener(function(_content_port) {
        cpcsp_console_log(LOG_LEVEL_INFO, "background.js: Connected from tabid:" + _content_port.name);
        g_content_ports[_content_port.name] = _content_port;

        _content_port.onMessage.addListener(function(msg) {
            sendNativeMessage(msg);
        });
        _content_port.onDisconnect.addListener(function() {
            g_content_ports[_content_port.name] = null;
            if(g_native_ports[_content_port.name])
                g_native_ports[_content_port.name].disconnect();
            g_native_ports[_content_port.name] = null;
        });
        if(!g_native_ports[_content_port.name])
            connect(_content_port);
        browserInstance.action.setIcon({tabId: _content_port.sender.tab.id, path:"icons/status/icon_active_128.png"});
        browserInstance.action.setPopup({tabId: _content_port.sender.tab.id, popup:"popup_ok.html"});
});

browserInstance.runtime.onMessage.addListener(function (request, sender){
    if (request == "set_log_level=debug"){
        set_log_level(LOG_LEVEL_DEBUG);
        return;
    }else if (request == "set_log_level=info"){
        set_log_level(LOG_LEVEL_INFO);
        return;
    }else if (request == "set_log_level=error"){
        set_log_level(LOG_LEVEL_ERROR);
        return;
    }
});

