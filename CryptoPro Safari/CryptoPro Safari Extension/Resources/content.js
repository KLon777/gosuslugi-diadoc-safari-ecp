// ===== Safari (NMA): адрес nmcades_plugin_api.js для cadesplugin_api.js, см. cades_safari_hook.js =====
var __nmaHookReady = new Promise(function (res) {
    try {
        var el = document.createElement("script");
        el.src = chrome.runtime.getURL("cades_safari_hook.js");
        el.dataset.url = chrome.runtime.getURL("nmcades_plugin_api.js");
        el.onload = el.onerror = function () { el.remove(); res(); };
        (document.head || document.documentElement).appendChild(el);
    } catch (e) { res(); }
});
; (function () {

    //порт для канала в background.js
    let g_bg_port = null;
    let g_return_window = null;
    const LOG_LEVEL_DEBUG = 4;
    const LOG_LEVEL_INFO = 2;
    const LOG_LEVEL_ERROR = 1;
    let current_log_level = LOG_LEVEL_ERROR;
    let EnableInternalCSP;
    let isFireFox = false;
    let isEdge = false;
    let isSafari = false;
    let isYandex = false;
    let isOpera = false;
    let browserInstance;
    let is_this_extension_loaded = false;
    let extension_id = "";

    function add_extension_version_listeners() {
        window.addEventListener("message", function (event) {
            if (event.source !== window)
                return;
            if (event.data !== "cadesplugin_extension_version_request") {
                return;
            }
            ext_version = get_extension_version();
            if (ext_version !== "")
                window.postMessage("cadesplugin_extension_version_response:" + ext_version, "*");
        }, false);

        window.addEventListener("message", function (event) {
            if (event.source !== window)
                return;
            if (event.data !== "cadesplugin_extension_id_request") {
                return;
            }
            window.postMessage("cadesplugin_extension_id_response:" + extension_id, "*");
        }, false);
    }

    function get_extension_version() {
        try {
            if (true) { // Safari Web Extension: как в Chrome
                var manifest = browserInstance.runtime.getManifest();
                return manifest.version;
            }
        }
        catch (err) {
            cpcsp_console_log(LOG_LEVEL_ERROR, "Failed to get extension version: " + err);
        }
        return "";
    }

    function check_browser() {
        var ua = navigator.userAgent, tem, M = ua.match(/(opera|yabrowser|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
        if (/trident/i.test(M[1])) {
            tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
            return { name: 'IE', version: (tem[1] || '') };
        }
        if (M[1] === 'Chrome') {
            tem = ua.match(/\b(OPR|Edg|YaBrowser)\/(\d+)/);
            if (tem != null)
                return { name: tem[1].replace('OPR', 'Opera'), version: tem[2] };
        }
        M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
        if ((tem = ua.match(/version\/(\d+)/i)) != null)
            M.splice(1, 1, tem[1]);
        return { name: M[0], version: M[1] };
    }
    var browserSpecs = check_browser();

    if (browserSpecs.name === 'Edg') {
        isEdge = true;
        browserInstance = chrome;
    }
    if (browserSpecs.name === 'Opera') {
        isOpera = true;
        browserInstance = chrome;
    }
    if (browserSpecs.name === 'Chrome') {
        browserInstance = chrome;
    }
    if (browserSpecs.name === 'YaBrowser') {
        isYandex = true;
        browserInstance = chrome;
    }
    if (browserSpecs.name === 'Firefox') {
        isFireFox = true;
        browserInstance = browser;
    }
    if (browserSpecs.name === 'Safari') {
        isSafari = true; browserInstance = chrome;
    }
    if (isSafari) {
        extension_id = "v3";
    } else {
        extension_id = chrome.runtime.id;
    }

    function load_this_extension() {
        if (!is_this_extension_loaded) {
            is_this_extension_loaded = true;
            window.addEventListener("message", function (event) {
                if (event.source !== window)
                    return;
                if (event.data === "cadesplugin_echo_request_" + extension_id) {
                    var answer = "cadesplugin_loaded";
                    if (isFireFox || isEdge) {
                        answer += "url:";
                        answer += browserInstance.runtime.getURL("nmcades_plugin_api.js");
                    } else if (isSafari) {
                        answer += "url:";
                        answer += "safari-extension://nma-cryptopro/nmcades_plugin_api.js";
                    }
                    __nmaHookReady.then(function () { window.postMessage(answer, "*"); });
                    return;
                }
                if (typeof (event.data.destination) === "undefined" || event.data.destination !== ("nmcades_" + extension_id)) {
                    return;
                }
                g_return_window = event.source;
                try {
                    if (!g_bg_port) {
                        connect(g_tabid);
                        add_extension_version_listeners();
                    }

                    if (true) { // Safari Web Extension: как в Chrome
                        g_bg_port.postMessage({ tabid: g_tabid, data: event.data });
                    } else {
                        safari.extension.dispatchMessage("messageToExtension", { message: JSON.stringify({ tabid: g_tabid, data: event.data }) });
                    }
                } catch (e) {
                    cpcsp_console_log("Error connect to extension when sending request");
                    window.postMessage({ tabid: g_tabid, data: { type: "error", requestid: event.data.requestid, message: "Lost connection to extension" } }, "*");
                }
                cpcsp_console_log(LOG_LEVEL_DEBUG, "content.js: Sent message to background:" + JSON.stringify({ tabid: g_tabid, data: event.data }));
            }, false);
        }
        window.postMessage("cadesplugin_echo_request_" + extension_id, "*");
    }

    //generate random tabid
    function gen_tabid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return function () {
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        };
    }

    let g_tabid = gen_tabid()();

    function get_formatted_time() {
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
            const time = get_formatted_time();
            if (level === LOG_LEVEL_DEBUG)
                console.log("[%s] DEBUG: %s", time, msg);
            if (level === LOG_LEVEL_INFO)
                console.info("[%s] INFO: %s", time, msg);
            if (level === LOG_LEVEL_ERROR)
                console.error("[%s] ERROR: %s", time, msg);
        }
    }

    function set_log_level(level) {
        current_log_level = level;
        if (current_log_level === LOG_LEVEL_DEBUG)
            cpcsp_console_log(LOG_LEVEL_INFO, "content.js: log_level = DEBUG");
        if (current_log_level === LOG_LEVEL_INFO)
            cpcsp_console_log(LOG_LEVEL_INFO, "content.js: log_level = INFO");
        if (current_log_level === LOG_LEVEL_ERROR)
            cpcsp_console_log(LOG_LEVEL_INFO, "content.js: log_level = ERROR");
    }

    // Установить флаг использования mini-csp
    window.addEventListener("message", function (event) {
        if (event.source !== window)
            return;
        if (event.data === "EnableInternalCSP=true") {
            EnableInternalCSP = true;
            cpcsp_console_log(LOG_LEVEL_INFO, "content.js: EnableInternalCSP=true");
        } else if (event.data === "EnableInternalCSP=false") {
            EnableInternalCSP = false;
            cpcsp_console_log(LOG_LEVEL_INFO, "content.js: EnableInternalCSP=false");
        }
    }, false);

    function bg_on_message(msg) {
        if (msg.data.type === "result" || msg.data.type === "error") {
            cpcsp_console_log(LOG_LEVEL_DEBUG, "content.js: Sent message to nmcades_plugin:" + JSON.stringify(msg));
            window.postMessage(msg, "*");
            return;
        }
        // CADES-1371: Для Safari нет рабочей background.js, всегда показываем диалог
        if (msg.data.type === "approved_site") {
            var isApproved = false;
            if (!msg.data.value.indexOf("add_approved_site:")) {
                var isApproved = true;
            }
            args = new Array();
            arg = { type: typeof isApproved, value: isApproved };
            args.push(arg);
            msg.data.params = args;
            cpcsp_console_log(LOG_LEVEL_DEBUG, "content.js: Sent message to background:" + JSON.stringify(msg));
            if (true) { // Safari Web Extension: как в Chrome
                g_bg_port.postMessage(msg);
            } else {
                safari.extension.dispatchMessage("messageToExtension", { message: JSON.stringify(msg) });
            }
            return;
        }
        if (msg.data.type === "callback") {
            let result;
            if (msg.data.value === "result = window.document.URL") {
                result = window.document.URL;
            } else if (msg.data.value === "result = cadesplugin.EnableInternalCSP") {
                if (typeof EnableInternalCSP === "undefined") {
                    result = false;
                } else result = EnableInternalCSP;
            } else if (msg.data.object !== undefined) {
                window.postMessage(msg.data, "*");
            } else {
                result = "Internal error on content.js callback call";
                cpcsp_console_log(LOG_LEVEL_ERROR, "content.js: Internal error on content.js callback call " + JSON.stringify(msg.data.value));
            }
            msg.data.type = "result";
            args = new Array();
            arg = { type: typeof result, value: result };
            args.push(arg);
            msg.data.params = args;
            cpcsp_console_log(LOG_LEVEL_DEBUG, "content.js: Sent message to background:" + JSON.stringify(msg));
            if (true) { // Safari Web Extension: как в Chrome
                g_bg_port.postMessage(msg);
            } else {
                safari.extension.dispatchMessage("messageToExtension", { message: JSON.stringify(msg) });
            }
        }
    }

    function connect() {
        if (true) { // Safari Web Extension: как в Chrome
            g_bg_port = browserInstance.runtime.connect({ name: g_tabid });
            g_bg_port.onMessage.addListener(function (msg) {
                bg_on_message(msg);
            });
            g_bg_port.onDisconnect.addListener(function () {
                g_bg_port = null;
            });
        } else {
            g_bg_port = 1;
            safari.self.addEventListener("message", function (event) {
                let data = JSON.parse(event.message.data);
                bg_on_message(data);
            });
            setInterval(() => safari.extension.dispatchMessage("messageToExtension", { message: "Ping" }), 25000);
            //Вызывается когда происходит переход на странице на другую страницу или релоад.
            window.addEventListener("pagehide", function (event) {
                safari.extension.dispatchMessage("messageToExtension", { message: JSON.stringify({ tabid: g_tabid, data: { type: "Page reloaded" } }) });
            });
        }
    }

    //Установить уровень логов
    window.addEventListener("message", function (event) {
        if (event.source !== window || isSafari)
            return;
        if (event.data === "set_log_level=debug") {
            set_log_level(LOG_LEVEL_DEBUG);
            browserInstance.runtime.sendMessage("set_log_level=debug");
        } else if (event.data === "set_log_level=info") {
            set_log_level(LOG_LEVEL_INFO);
            browserInstance.runtime.sendMessage("set_log_level=info");
        } else if (event.data === "set_log_level=error") {
            set_log_level(LOG_LEVEL_ERROR);
            browserInstance.runtime.sendMessage("set_log_level=error");
        }
    }, false);

    function is_script_loaded(src) {
        const scripts = document.scripts;
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].src === src) {
                return true;
            }
        }
        return false;
    }

    function load_single_extension() {
        if (isSafari || is_script_loaded("chrome-extension://" + extension_id + "/nmcades_plugin_api.js")) {
            load_this_extension();
        }
    }

    //EventListner для обработки ситуации когда расширение загрузилось раньше скрипта на странице
    // в такой ситуации начальное сообщение будет пропущенно и нам нужно ждать "cadesplugin_echo_request"
    window.addEventListener("message", function (event) {
        if (event.source !== window)
            return;
        if (event.data === "cadesplugin_echo_request") {
            load_single_extension();
            return;
        }
    }, false);

    load_single_extension();
    window.postMessage("EnableInternalCSP_request", "*");
    cpcsp_console_log(LOG_LEVEL_INFO, "content.js: content.js loaded");
}());
