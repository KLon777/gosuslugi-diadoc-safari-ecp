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
