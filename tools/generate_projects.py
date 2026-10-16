#!/usr/bin/env python3
"""
Для сопровождающих: пересоздаёт Xcode-проекты «Gosplugin Safari», «Kontur Safari» и «CryptoPro Safari»
из свежих официальных расширений (Chrome Web Store) и шаблонов из templates/.

  python3 tools/generate_projects.py          # оба
  python3 tools/generate_projects.py gos      # только Госплагин

Нужен Xcode (safari-web-extension-converter). Пользователям этот скрипт не нужен —
они просто открывают готовые проекты в Xcode.
"""
import os, plistlib, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import prepare_extension  # noqa: E402

APPS = {
    "gos": {
        "APP_NAME": "Gosplugin Safari", "SUFFIX": "gosplugin", "PORT": "9105",
        "HOSTS": '"chrome.gosuslugi.plugin", "gosuslugi.plugin"', "MAIN_HOST": "chrome.gosuslugi.plugin",
        "PLUGIN_NAME": "Госплагин", "PLUGIN_SITE": "gosuslugi.ru",
        "DESCRIPTION": "Вход и подпись по ЭЦП на Госуслугах в Safari через официальный Госплагин.",
    },
    "kontur": {
        "APP_NAME": "Kontur Safari", "SUFFIX": "kontur", "PORT": "9106",
        "HOSTS": '"kontur.plugin", "kd.nc"', "MAIN_HOST": "kontur.plugin",
        "PLUGIN_NAME": "Контур.Плагин", "PLUGIN_SITE": "kontur.ru",
        "DESCRIPTION": "Вход и подпись по ЭЦП в Диадоке и других сервисах Контура в Safari через официальный Контур.Плагин.",
    },
    "cryptopro": {
        "APP_NAME": "CryptoPro Safari", "SUFFIX": "cryptopro", "PORT": "9107",
        "HOSTS": '"ru.cryptopro.nmcades"', "MAIN_HOST": "ru.cryptopro.nmcades",
        "PLUGIN_NAME": "КриптоПро ЭЦП Browser plug-in", "PLUGIN_SITE": "cryptopro.ru",
        "DESCRIPTION": "Подпись по ЭЦП в Safari через КриптоПро ЭЦП Browser plug-in (CAdES): ФНС (nalog.ru), торговые площадки и другие сайты.",
    },
}
BUNDLE_PREFIX = "local.safaricrypto"
DEPLOYMENT_TARGET = "12.0"


def render(name, cfg):
    s = open(os.path.join(ROOT, "templates", name), encoding="utf-8").read()
    for k, v in cfg.items():
        s = s.replace("__%s__" % k, v)
    return s


def fix_pbxproj(path, suffix):
    s = open(path, encoding="utf-8").read()

    def block(m):
        b = m.group(0)
        if "PRODUCT_BUNDLE_IDENTIFIER" not in b:
            # уровень проекта: общий префикс bundle id, его легко поменять в Build Settings
            if "NMA_BUNDLE_PREFIX" not in b:
                b = b.replace("buildSettings = {",
                              "buildSettings = {\n\t\t\t\tNMA_BUNDLE_PREFIX = %s;" % BUNDLE_PREFIX, 1)
        else:
            is_ext = re.search(r'PRODUCT_BUNDLE_IDENTIFIER = "?[^;"]*\.Extension"?;', b) is not None
            bid = "$(NMA_BUNDLE_PREFIX).%s%s" % (suffix, ".Extension" if is_ext else "")
            b = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [^;]*;", 'PRODUCT_BUNDLE_IDENTIFIER = "%s";' % bid, b)
            b = re.sub(r"\n\t+DEVELOPMENT_TEAM = [^;]*;", "", b)
            if is_ext:
                if "ENABLE_OUTGOING_NETWORK_CONNECTIONS" not in b:
                    b = b.replace("ENABLE_APP_SANDBOX = YES;",
                                  "ENABLE_APP_SANDBOX = YES;\n\t\t\t\tENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;")
            else:
                # приложение запускает native host плагина, поэтому оно вне песочницы
                b = b.replace("ENABLE_APP_SANDBOX = YES;", "ENABLE_APP_SANDBOX = NO;")
                b = re.sub(r"\n\t+ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;", "", b)
        b = re.sub(r"MACOSX_DEPLOYMENT_TARGET = [^;]*;", "MACOSX_DEPLOYMENT_TARGET = %s;" % DEPLOYMENT_TARGET, b)
        return b

    s = re.sub(r"buildSettings = \{.*?\n\t\t\t\};", block, s, flags=re.S)
    open(path, "w", encoding="utf-8").write(s)


def generate(kind):
    cfg = APPS[kind]
    app = cfg["APP_NAME"]
    work = tempfile.mkdtemp(prefix="nma-")
    try:
        src = os.path.join(work, "src")
        prepare_extension.prepare(kind, src)
        out = os.path.join(work, "xcode")
        subprocess.run(["xcrun", "safari-web-extension-converter", src, "--project-location", out,
                        "--app-name", app, "--bundle-identifier", "%s.%s" % (BUNDLE_PREFIX, cfg["SUFFIX"]),
                        "--macos-only", "--swift", "--no-open", "--no-prompt", "--copy-resources", "--force"],
                       check=True, stdout=subprocess.DEVNULL)
        proj = os.path.join(out, app)
        appdir, extdir = os.path.join(proj, app), os.path.join(proj, app + " Extension")

        fix_pbxproj(os.path.join(proj, app + ".xcodeproj", "project.pbxproj"), cfg["SUFFIX"])
        files = {
            "AppDelegate.swift": os.path.join(appdir, "AppDelegate.swift"),
            "ViewController.swift": os.path.join(appdir, "ViewController.swift"),
            "Main.html": os.path.join(appdir, "Resources", "Base.lproj", "Main.html"),
            "Script.js": os.path.join(appdir, "Resources", "Script.js"),
            "Style.css": os.path.join(appdir, "Resources", "Style.css"),
            "SafariWebExtensionHandler.swift": os.path.join(extdir, "SafariWebExtensionHandler.swift"),
        }
        for tpl, dst in files.items():
            open(dst, "w", encoding="utf-8").write(render(tpl, cfg))

        ip = os.path.join(extdir, "Info.plist")
        with open(ip, "rb") as f:
            info = plistlib.load(f)
        info["NSAppTransportSecurity"] = {"NSAllowsLocalNetworking": True}
        with open(ip, "wb") as f:
            plistlib.dump(info, f)

        for dp, dn, _ in os.walk(proj):
            for d in list(dn):
                if d == "xcuserdata":
                    shutil.rmtree(os.path.join(dp, d))

        dest = os.path.join(ROOT, app)
        if os.path.exists(dest):
            shutil.rmtree(dest)
        shutil.move(proj, dest)
        print("Проект готов:", os.path.join(dest, app + ".xcodeproj"))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    kinds = sys.argv[1:] or list(APPS)
    for k in kinds:
        if k not in APPS:
            raise SystemExit("usage: generate_projects.py [gos] [kontur] [cryptopro]")
        generate(k)
