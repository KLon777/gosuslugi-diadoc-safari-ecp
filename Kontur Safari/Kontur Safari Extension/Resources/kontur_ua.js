// Выполняется в контексте страницы на сайтах Контура (подключается из content.js расширения).
// Сайты Контура (в т.ч. выпуск сертификатов lk.ca.kontur.ru) пускают только «поддерживаемые» браузеры
// и отсеивают Safari по User-Agent. Здесь страница видит Chrome; HTTP-заголовок подменяет
// правило declarativeNetRequest (kontur_ua_rules.json).
(function () {
	if (window.__nmaKonturUA) return;
	window.__nmaKonturUA = true;
	try { document.documentElement.setAttribute("data-nma-ua", "1"); } catch (e) {}
	var V = "131.0.0.0";
	var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + V + " Safari/537.36";
	var APPV = UA.replace(/^Mozilla\//, "");
	function def(obj, name, value) {
		try { Object.defineProperty(obj, name, { get: function () { return value; }, configurable: true, enumerable: true }); } catch (e) {}
	}
	var proto = Object.getPrototypeOf(navigator);
	def(proto, "userAgent", UA);
	def(proto, "appVersion", APPV);
	def(proto, "vendor", "Google Inc.");
	var brands = [{ brand: "Google Chrome", version: "131" }, { brand: "Chromium", version: "131" }, { brand: "Not_A Brand", version: "24" }];
	def(proto, "userAgentData", {
		brands: brands, mobile: false, platform: "macOS",
		toJSON: function () { return { brands: brands, mobile: false, platform: "macOS" }; },
		getHighEntropyValues: function (h) {
			return Promise.resolve({ brands: brands, mobile: false, platform: "macOS", platformVersion: "10.15.7",
				architecture: "x86", bitness: "64", model: "", uaFullVersion: V,
				fullVersionList: brands.map(function (b) { return { brand: b.brand, version: V }; }) });
		}
	});
	try { if (!window.chrome) window.chrome = { runtime: {} }; } catch (e) {}
})();
