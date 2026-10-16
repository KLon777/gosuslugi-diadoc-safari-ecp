// Выполняется в контексте страницы (подключается из content.js расширения КриптоПро).
// cadesplugin_api.js на сайтах для Safari принимает только адрес вида
// safari-extension://…/nmcades_plugin_api.js (старый формат Safari App Extension), а у Safari
// Web Extension адрес safari-web-extension://… Поэтому расширение отдаёт странице условный
// адрес, а здесь он подменяется на настоящий в момент подключения скрипта.
(function () {
	var s = document.currentScript, real = s && s.dataset && s.dataset.url;
	if (!real || window.__nmaCadesHook) return;
	window.__nmaCadesHook = true;
	var FAKE = /^safari-extension:\/\/nma-cryptopro\/nmcades_plugin_api\.js$/;
	function fix(v) { return FAKE.test(String(v)) ? real : v; }
	var sa = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (n, v) {
		if (this instanceof HTMLScriptElement && String(n).toLowerCase() === "src") v = fix(v);
		return sa.call(this, n, v);
	};
	var d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
	if (d && d.set) {
		Object.defineProperty(HTMLScriptElement.prototype, "src", {
			configurable: true, enumerable: d.enumerable, get: d.get,
			set: function (v) { d.set.call(this, fix(v)); }
		});
	}
})();
