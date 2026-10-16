#!/usr/bin/env python3
"""
Скачивает оригинальное расширение из Chrome Web Store, распаковывает и патчит его под Safari.

  python3 tools/prepare_extension.py gos|kontur|cryptopro OUT_DIR   (обычно вызывается из generate_projects.py)

Патчи:
  * вставляется extension/nt_shim.js — транспорт через appex и мост;
  * chrome.runtime.connectNative / sendNativeMessage заменяются на транспорт;
  * Госплагин: всегда протокол nmh (WebSocket на localhost в Safari заблокирован);
  * КриптоПро: content.js переведён со старого Safari App Extension API на обычный
    runtime.connect, а адрес nmcades_plugin_api.js подменяется (cades_safari_hook.js);
  * Контур: убрана зависимость от chrome.management (в Safari его нет, из-за этого
    расширение молча отбрасывало запросы);
  * manifest: убраны key/update_url и неподдерживаемые разрешения, добавлен nativeMessaging.
"""
import io, json, os, shutil, struct, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTENSIONS = {
    "gos": {"id": "jabjbhgjaidecageckilhonbggakppme", "name": "Госплагин"},
    "kontur": {"id": "momffihklfhkoakghidmkdocdkbfmoac", "name": "Контур.Плагин"},
    "cryptopro": {"id": "pfhgbfnnjiafkhfdkmpiflachepdcjod", "name": "КриптоПро ЭЦП Browser plug-in"},
}
CRX_URL = ("https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0"
           "&acceptformat=crx2,crx3&x=id%3D{id}%26uc")


def download_crx(ext_id):
    with urllib.request.urlopen(CRX_URL.format(id=ext_id), timeout=60) as r:
        return r.read()


def crx_to_zip(data):
    if data[:4] != b"Cr24":
        raise ValueError("not a CRX file")
    version = struct.unpack("<I", data[4:8])[0]
    if version == 3:
        header_len = struct.unpack("<I", data[8:12])[0]
        return data[12 + header_len:]
    if version == 2:
        pk_len, sig_len = struct.unpack("<II", data[8:16])
        return data[16 + pk_len + sig_len:]
    raise ValueError("unknown CRX version %d" % version)


def must_replace(s, old, new, count=-1, what=""):
    if old not in s:
        raise SystemExit("Патч не применился (%s): не найдено %r. Возможно, вышла новая версия "
                         "расширения — нужно обновить tools/prepare_extension.py" % (what, old[:80]))
    return s.replace(old, new, count)


def patch_gos(out, shim):
    p = os.path.join(out, "background.js")
    s = open(p, encoding="utf-8").read()
    s = must_replace(s, "chrome.runtime.connectNative(", "__nativeConnect(", what="gos connectNative")
    s = must_replace(s, "chrome.runtime.sendNativeMessage(", "__nativeSendOnce(", what="gos sendNativeMessage")
    s = must_replace(s, 'return result === "ws" ? ws : nmh;',
                     "return nmh; // Safari: только native messaging через мост", 1, "gos protocol")
    lines = s.split("\n")
    imports = [i for i, l in enumerate(lines) if l.strip().startswith("import ")]
    lines.insert((max(imports) + 1) if imports else 0, shim)
    open(p, "w", encoding="utf-8").write("\n".join(lines))


def patch_kontur(out, shim):
    p = os.path.join(out, "background.js")
    s = open(p, encoding="utf-8").read()
    s = must_replace(s, "chrome.runtime.connectNative(", "__nativeConnect(", what="kontur connectNative")
    s = must_replace(s, "if (request.isNewType || !(extensions.searchError || oldExtension.enabled)) {",
                     "if (request.isNewType || !oldExtension.enabled) { // Safari: нет chrome.management",
                     1, "kontur searchError")
    open(p, "w", encoding="utf-8").write(shim + "\n" + s)


CADES_HOOK_LOADER = """// ===== Safari (NMA): адрес nmcades_plugin_api.js для cadesplugin_api.js, см. cades_safari_hook.js =====
var __nmaHookReady = new Promise(function (res) {
    try {
        var el = document.createElement("script");
        el.src = chrome.runtime.getURL("cades_safari_hook.js");
        el.dataset.url = chrome.runtime.getURL("nmcades_plugin_api.js");
        el.onload = el.onerror = function () { el.remove(); res(); };
        (document.head || document.documentElement).appendChild(el);
    } catch (e) { res(); }
});
"""


def patch_cryptopro(out, shim):
    p = os.path.join(out, "background.js")
    s = open(p, encoding="utf-8").read()
    s = must_replace(s, "browserInstance.runtime.connectNative(", "__nativeConnect(", what="cryptopro connectNative")
    open(p, "w", encoding="utf-8").write(shim + "\n" + s)

    # content.js: в Safari оригинал рассчитан на старый Safari App Extension (safari.extension.*),
    # а у нас Safari Web Extension — общаемся с background так же, как в Chrome.
    p = os.path.join(out, "content.js")
    s = open(p, encoding="utf-8").read()
    s = must_replace(s, "isSafari = true;", "isSafari = true; browserInstance = chrome;", 1, "cryptopro safari browser")
    s = must_replace(s, "if (!isSafari) {", "if (true) { // Safari Web Extension: как в Chrome", what="cryptopro messaging")
    s = must_replace(s, 'answer += safari.extension.baseURI + "nmcades_plugin_api.js";',
                     'answer += "safari-extension://nma-cryptopro/nmcades_plugin_api.js";', 1, "cryptopro url")
    s = must_replace(s, 'window.postMessage(answer, "*");',
                     '__nmaHookReady.then(function () { window.postMessage(answer, "*"); });', 1, "cryptopro answer")
    open(p, "w", encoding="utf-8").write(CADES_HOOK_LOADER + s)
    shutil.copy(os.path.join(ROOT, "extension", "cades_safari_hook.js"), os.path.join(out, "cades_safari_hook.js"))
    m = json.load(open(os.path.join(out, "manifest.json"), encoding="utf-8"))
    for w in m.get("web_accessible_resources", []):
        if "nmcades_plugin_api.js" in w.get("resources", []):
            w["resources"].append("cades_safari_hook.js")
    json.dump(m, open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def patch_manifest(out):
    p = os.path.join(out, "manifest.json")
    m = json.load(open(p, encoding="utf-8"))
    for k in ("key", "update_url"):
        m.pop(k, None)
    perms = [x for x in m.get("permissions", []) if x != "management"]
    if "nativeMessaging" not in perms:
        perms.append("nativeMessaging")
    m["permissions"] = perms
    json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return m.get("version")


def prepare(kind, out):
    info = EXTENSIONS[kind]
    print("Скачиваю %s (%s) из Chrome Web Store..." % (info["name"], info["id"]))
    z = zipfile.ZipFile(io.BytesIO(crx_to_zip(download_crx(info["id"]))))
    if os.path.exists(out):
        shutil.rmtree(out)
    z.extractall(out)
    shutil.rmtree(os.path.join(out, "_metadata"), ignore_errors=True)
    shim = open(os.path.join(ROOT, "extension", "nt_shim.js"), encoding="utf-8").read()
    {"gos": patch_gos, "kontur": patch_kontur, "cryptopro": patch_cryptopro}[kind](out, shim)
    version = patch_manifest(out)
    print("Готово: %s %s" % (info["name"], version))


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in EXTENSIONS:
        raise SystemExit("usage: prepare_extension.py gos|kontur|cryptopro OUT_DIR")
    prepare(sys.argv[1], sys.argv[2])
