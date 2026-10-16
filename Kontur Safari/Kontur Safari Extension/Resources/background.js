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


// --------------------------------- Общий код ---------------------------------

var manifest = chrome.runtime.getManifest(),
	info = {
		id: chrome.runtime.id,
		state: 1,
		type: "chrome",
		version: manifest.version
	};

function Extensions() {
	var that = this;

	this.olds = {
		diag: {
			enabled: false
		},
		plugin: {
			enabled: false
		}
	};

	function checkOldExtension(ext) {
		var oldDiags = {
				"inlmamahcfioibldbpbaechbpeeaelin": true,
				"pioommjcfaefbcpbdokfoadjhlmahjjm": true,
				"adipnhhjfmoehhkepljbifddkobenooa": true,
				"fmdmnjcgegbabdefddkijefeadkhchcn": true,
				"diag.helper@skbkontur.ru": true
			},
			oldPlugins = {
				"hnhppcgejeffnbnioloohhmndpmclaga": true,
				"nejicfcnfnecdilmajlppdcgbjilgeec": true,
				"akpjpngckapnibajopggmfhnchfpnkkf": true,
				"kontur.toolbox@gmail.com": true
			};

		if (oldDiags[ext.id]) {
			that.olds.diag.enabled = ext.enabled;
		} else if (oldPlugins[ext.id]) {
			that.olds.plugin.enabled = ext.enabled;
		}
	}

	var callbacks = {};

	this.subscribe = function(key, callback) {
		callbacks[key] = callback;
	};

	this.unsubscribe = function(id) {
		delete callbacks[id];
	};

	function handle(action) {
		return function(ext) {
			checkOldExtension(ext);
			for (var key in callbacks) {
				callbacks[key]({ id: ext.id, action: action });
			}
		};
	}

	try {
		chrome.management.onEnabled.addListener(handle("enabled"));
		chrome.management.onDisabled.addListener(handle("disabled"));
		chrome.management.onInstalled.addListener(handle("installed"));
		var handleUninstall = handle("uninstalled");
		chrome.management.onUninstalled.addListener(function(id) {
			var extId = typeof id === "string" ? id : (id || {}).id;
			handleUninstall({ id: extId });
		});
	} catch (e) {
		this.subscribeError = e;
	}

	this.getAll = function(callback, reject) {
		try {
			chrome.management.getAll(callback);
		} catch(e) {
			reject(e);
		}
	};

	this.getAll(function(exts) {
		exts.forEach(checkOldExtension);
	}, function(e) {
		that.searchError = e;
	});

	this.setEnabled = function(id, enable, callback, reject) {
		try {
			chrome.management.setEnabled(id, enable, callback);
		} catch(e) {
			reject(e);
		}
	};
}

var extensions = new Extensions();

function tryDisconnect(port) {
	try {
		port.disconnect();
	} catch (_) { }
}

// -------------------------------- Диагностика --------------------------------

function isDiagDomains(origin) {
	try {
		var url = new URL(origin),
			hostname = url.hostname,
			protocol = url.protocol,
			isHttp = protocol === "http:",
			isHttps = protocol === "https:";
		if (hostname === "localhost.testkontur.ru") {
			return isHttp || isHttps;
		}
		if (!isHttps) {
			return false;
		}
		var goodDomains = [
				"help\\d?",
				"install\\d?",
				"tp",
				"tp-dev",
				"csi-tp-dev",
				"csi-dev-stable"
			].join("|"),
			goodDomainsRegex = new RegExp("^(" + goodDomains + ")\\.(kontur|testkontur)\\.ru$");
		return goodDomainsRegex.test(hostname);
	} catch (_) {
		return false;
	}
}

function filterResponse(obj) {
	var copyObj = {};
	if ("cmd" in obj) {
		copyObj.cmd = obj.cmd;
	}
	if ("sid" in obj) {
		copyObj.sid = obj.sid;
	}
	return copyObj;
}

function ConnectDiag(sessionId, onMessage) {
	var that = this,
		port = null;

	this.close = function() {
		if (port) {
			tryDisconnect(port);
			port = null;
		}
	};

	function responseControl(request, result) {
		var response = filterResponse(request);
		response.type = "Control";
		response.result = result;
		onMessage(response);
	}

	function responseFailed(request, e) {
		var response = filterResponse(request);
		response.type = "Control";
		response.result = "Failed";
		response.errorMessage = e.message;
		response.kdError = 1;
		onMessage(response);
	}

	function handleExtensionRequest(request) {
		var cmd = request.cmd;
		var args = request.args || {};
		if (cmd == -1) { // Info
			if (args.extensionId && args.extensionId !== info.id) {
				setTimeout(function() {
					responseControl(request, info);
				}, 500);
			} else {
				responseControl(request, info);
			}
		} else if (cmd == -2) { // Disconnect
			responseControl(request, true);
			that.close();
		} else if (cmd == -3) { // Management API - getAll
			extensions.getAll(
				function(result) {
					responseControl(request, result);
				},
				function(e) {
					responseFailed(request, e);
				});
		} else if (cmd == -4) { // Management API - subscribe
			if (extensions.subscribeError) {
				responseFailed(request, extensions.subscribeError)
				return;
			}
			extensions.subscribe(sessionId,
				function(result) {
					onMessage({
						type: "ManagementEvent",
						result: result
					});
				});
			responseControl(request, true);
		} else if (cmd == -5) { // Management API - unsubscribe
			extensions.unsubscribe(sessionId);
			responseControl(request, true);
		} else if (cmd == -6) { // Management API - setEnabled
			extensions.setEnabled(args.id, args.enable,
				function() {
					responseControl(request, true);
				},
				function(e) {
					responseFailed(request, e);
				});
		} else if (cmd == -7) { // Management API - uninstallSelf
			if (!args.extensionId || (args.extensionId !== info.id)) {
				request.result = info;
				request.type = "ExtensionUninstallSelfDenied";
				request.kdError = 1;
				onMessage(request);
				return;
			}
			request.result = true;
			onMessage(request);
			that.close();
			chrome.management.uninstallSelf();
		} else {
			request.result = false;
			request.type = "NotImplemented";
			request.kdError = 1;
			onMessage(request);
		}
	}

	function sendRequest(request) {
		if (request.cmd < 0) {
			handleExtensionRequest(request);
			return;
		}
		try {
			if (!port) {
				port = __nativeConnect("kd.nc");
				port.onMessage.addListener(onMessage);
				port.onDisconnect.addListener(function() {
					var error = chrome.runtime.lastError;
					onMessage({
						type: "DisconnectNativePort",
						message: error ? error.message : "disconnect from native messaging host"
					});
					port = null;
				});
			}
			port.postMessage(request);
		} catch (e) {
			var response = filterResponse(request),
				lastError = chrome.runtime.lastError;
			response.type = "NativePortConnectError";
			response.errorMessage = e.message + (lastError ? " (" + lastError.message + ")" : "");
			response.kdError = 1;
			onMessage(response);
		}
	}

	function respondNoAccess(request) {
		var response = filterResponse(request);
		response.type = "NativeClientHasNotAccess";
		response.kdError = 5;
		onMessage(response);
	}

	function checkRequest(request) {
		that.send = isDiagDomains(request.origin) ? sendRequest : respondNoAccess;
		that.send(request);
	}

	this.send = checkRequest;
}

// ----------------------------------- Плагин ----------------------------------

function ConnectPlugin(sessionId, onMessage) {
	var that = this,
		port = null,
		buffers = {};

	function clear() {
		port = null;
		buffers = {};
	}

	this.close = function() {
		if (port) {
			tryDisconnect(port);
			clear();
		}
	};

	function handleExtensionRequest(request) {
		if (request.type === "extension.info") {
			onMessage({
				sessionId: sessionId,
				commandId: request.commandId,
				result: info
			});
			return;
		}
		if (request.type === "extension.close") {
			that.close();
			return;
		}
	}

	this.send = function(request) {
		if (request.hostUri === "null") {
			this.send = function() {};
			return;
		}
		if (String(request.type).startsWith("extension.")) {
			handleExtensionRequest(request);
			return;
		}
		try {
			if (!port) {
				port = __nativeConnect("kontur.plugin");
				port.onMessage.addListener(function(message) {
					if (message.isChunked) {
						var id = message.id,
							buffer = buffers[id] || "";
						buffer += message.data;
						if (!message.isFinalChunk) {
							buffers[id] = buffer;
							return;
						}
						delete buffers[id];
						message = JSON.parse(buffer);
					}
					onMessage(message);
				});
				port.onDisconnect.addListener(function() {
					clear();
					var error = chrome.runtime.lastError;
					onMessage({
						sessionId: sessionId,
						error: {
							type: "connect",
							message: error ? error.message : "disconnect from native messaging host"
						}
					});
				});
			}
			port.postMessage(request);
		} catch (e) {
			onMessage({
				sessionId: sessionId,
				commandId: request.commandId,
				error: {
					type: "connect",
					message: e ? e.message : "failed to send message to native messaging host"
				}
			});
		}
	};
}

// --------------------------------- Общий код ---------------------------------

function Session(sessionId, onMessage) {
	var that = this,
		connect = null,
		oldExtension = {};

	function sendRequest(request) {
		if (request.isNewType || !oldExtension.enabled) { // Safari: нет chrome.management
			connect.send(request);
		}
	}

	function routeRequest(request) {
		if ("cmd" in request) {
			connect = new ConnectDiag(sessionId, onMessage);
			oldExtension = extensions.olds.diag;
		} else if ("type" in request) {
			connect = new ConnectPlugin(sessionId, onMessage);
			oldExtension = extensions.olds.plugin;
		} else {
			var message = "invalid command structure";
			request.type = "ExtensionInvalidRequest";
			request.errorMessage = message;
			request.error = {
				type: "connect",
				message: message
			};
			onMessage(request);
			return;
		}
		that.send = sendRequest;
		that.send(request);
	}

	this.send = routeRequest;

	this.close = function() {
		if (connect) {
			connect.close();
			connect = null;
		}
	};
}

chrome.runtime.onConnect.addListener(function(port) {
	var session = new Session(port.name, onResponse);
	port.onMessage.addListener(function(message) {
		session.send(message);
	});
	port.onDisconnect.addListener(onDisconnect);

	function onResponse(message) {
		try {
			port.postMessage(message);
		} catch (_) {
			tryDisconnect(port);
			onDisconnect();
		}
	}

	function onDisconnect() {
		session.close();
		session = null;
	}
});

function reloadContentScripts() {
	var scripts = manifest.content_scripts[0].js;

	chrome.tabs.query(
		{},
		function(tabs) {
			tabs.forEach(function(tab) {
				if ((tab.status == "unloaded") || /^chrome:/.test(tab.url)) {
					return;
				}
				chrome.scripting.executeScript(
					{
						target: {
							tabId: tab.id,
							allFrames: true,
						},
						files: scripts,
					},
					function(_) {
						const lastErr = chrome.runtime.lastError;
						if (lastErr) {
							console.log("tab: " + tab.id + " lastError: " + JSON.stringify(lastErr));
						}
					}
				);
			});
		}
	);
}

function closeWebStorePage() {
	chrome.tabs.query(
		{
			url: [
				"https://chromewebstore.google.com/detail/*" + chrome.runtime.id + "*",
				"https://chrome.google.com/webstore/detail/*" + chrome.runtime.id + "*",
				"https://addons.opera.com/*/extensions/details/kontur.extension",
				"https://microsoftedge.microsoft.com/addons/detail/*" + chrome.runtime.id + "*"
			]
		},
		function(tabs) {
			tabs.forEach(function(tab) {
				chrome.tabs.query(
					{
						windowId: tab.windowId
					},
					function(windowTabs) {
						if ((windowTabs.length === 1) && (windowTabs[0].id === tab.id)) {
							chrome.windows.remove(tab.windowId);
						} else {
							chrome.tabs.remove(tab.id);
						}
					});
			});
		});
}

chrome.runtime.onInstalled.addListener(function(details) {
	reloadContentScripts();
	var isFirefox = ~navigator.userAgent.toLowerCase().indexOf("firefox/"),
		reason = details.reason;
	if (!isFirefox && (reason === "install" || reason === "update")) {
		closeWebStorePage();
	}
});
