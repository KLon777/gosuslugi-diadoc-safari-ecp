
(function() {
	if (window.KONTUR_EXTENSION_CONTENT) {
		return;
	}
	window.KONTUR_EXTENSION_CONTENT = true;

	function checkCurrentHostName() {
		return /(^|\.)(kontur|(kontur|kontur-ca|kontur-extern|testkontur)\.ru)$/.test(location.hostname);
	}

	var PLUGIN_FLAG_ATTRIBUTE = "kontur-toolbox-installed",
		KONTUR_EXTENSION_FLAG = "kontur-extension-installed";

	try {
		if (checkCurrentHostName()) {
			document.addEventListener("DOMContentLoaded", function() {
				if (document.head) {
					var meta = document.createElement("meta");
					meta.setAttribute(PLUGIN_FLAG_ATTRIBUTE, "true");
					meta.setAttribute(KONTUR_EXTENSION_FLAG, "true");
					document.head.appendChild(meta);
				}
			});
		}
	} catch (_) { }

	var ways = {
			diag: {
				old_response: "diag-helper-response",
				label_response: "kontur-diag-response",
				getDisconnectResponse: function(request) {
					var error = chrome.runtime.lastError;
					return {
						cmd: request.cmd,
						sid: request.sid,
						type: "DisconnectBackground",
						errorMessage: error ? error.message : "null lastError",
						kdError: error ? 1 : 0
					};
				},
				getConnectErrorResponse: function(request, sessionId, e) {
					return {
						cmd: request.cmd,
						sid: request.sid,
						type: "ContentError",
						errorMessage: e ? e.message : "null exception",
						kdError: 1
					};
				}
			},
			plugin: {
				old_response: "kontur-toolbox-response",
				label_response: "kontur-plugin-response",
				getDisconnectResponse: function(request, sessionId) {
					var error = chrome.runtime.lastError;
					return {
						sessionId: sessionId,
						error: {
							type: "connect",
							message: error ? error.message : "disconnect from background script"
						}
					};
				},
				getConnectErrorResponse: function(request, sessionId, e) {
					return {
						sessionId: sessionId,
						commandId: request.commandId,
						error: {
							type: "connect",
							message: e ? e.message : "failed to send message to background script"
						}
					};
				}
			}
		};

	function createSession(way, sessionId, origin) {
		var handleRequest = null,
			handleResponse = null;

		function updateHandlers(port, isNewType) {
			if (isNewType) {
				handleResponse = function(response) {
					window.postMessage({
						type: way.label_response,
						response: response
					}, origin);
				};
			} else {
				handleResponse = function(response) {
					window.postMessage({
						type: way.old_response,
						response: response,
						isNewExtension: true
					}, origin);
				};
			}
			if (port) {
				if (isNewType) {
					handleRequest = function(request) {
						request.isNewType = true;
						port.postMessage(request);
					};
				} else {
					handleRequest = function(request, _isNewType) {
						if (_isNewType) {
							updateHandlers(port, true);
							handleRequest(request);
							return;
						}
						port.postMessage(request);
					};
				}
			} else {
				handleRequest = function(request, _isNewType) {
					try {
						var _port = chrome.runtime.connect({ name: sessionId });
						_port.onMessage.addListener(function(response) {
							handleResponse(response);
						});
						_port.onDisconnect.addListener(function() {
							handleResponse(way.getDisconnectResponse(request, sessionId));
							updateHandlers();
						});

						updateHandlers(_port, _isNewType);
						handleRequest(request);
					} catch (e) {
						handleResponse(way.getConnectErrorResponse(request, sessionId, e));
					}
				};
			}
		}

		updateHandlers();

		return function(request, isNewType) {
			return handleRequest(request, isNewType)
		};
	};

	function createSender(way) {
		var sessions = {};

		return function(request, isNewType, origin, sessionId) {
			sessionId = sessionId || "default"
			var session = sessions[sessionId];
			if (!session) {
				session = sessions[sessionId] = createSession(way, sessionId, origin);
			}
			session(request, isNewType);
		};
	}

	var sendDiag = createSender(ways.diag),
		sendPlugin = createSender(ways.plugin);

	var DIAG_REQUEST_TYPE = "diag-helper-request",
		PLUGIN_REQUEST_TYPE = "kontur-toolbox-request",
		KONTUR_DIAG_REQUEST = "kontur-diag-request",
		KONTUR_PLUGIN_REQUEST = "kontur-plugin-request";

	function handleMessage(event) {
		var data = event.data;
		if (!data || !event.isTrusted || (event.source != window)) {
			return;
		}

		var request = data.request;
		if (!request) {
			return;
		}

		var type = data.type,
			isNewType = (type === KONTUR_DIAG_REQUEST) || (type === KONTUR_PLUGIN_REQUEST),
			toDiag = (type === KONTUR_DIAG_REQUEST) || (type === DIAG_REQUEST_TYPE),
			toPlugin = (type === KONTUR_PLUGIN_REQUEST) || (type === PLUGIN_REQUEST_TYPE),
			origin = event.origin;

		if (toDiag) {
			request.origin = origin;
			sendDiag(request, isNewType, origin, data.sessionId);
		} else if (toPlugin && request.sessionId) {
			request.hostUri = origin;
			sendPlugin(request, isNewType, origin, request.sessionId);
		}
	}

	window.addEventListener("message", handleMessage, false);

	// Firefox сам выгружает content-скрипты, для остальных - отправляем событие выгрузки
	function unloadScript() {
		window.removeEventListener(unloadEventType, unloadScript);
		window.removeEventListener("message", handleMessage, false);
	}

	var isFirefox = ~navigator.userAgent.toLowerCase().indexOf("firefox/");
	if (!isFirefox) {
		var unloadEventType = "unload_extension_" + chrome.runtime.id;

		window.dispatchEvent(new Event(unloadEventType));
		window.addEventListener(unloadEventType, unloadScript);
	}
})();
