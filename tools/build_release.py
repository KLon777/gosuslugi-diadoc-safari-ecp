#!/usr/bin/env python3
"""
Для сопровождающих: собирает релиз всех приложений —
без подписи разработчика (ad-hoc), universal (arm64 + x86_64).

  python3 tools/build_release.py

Результат в build/release/:
  ESign-Safari.dmg  — образ со всеми приложениями, фоном и ярлыком «Программы»

Для DMG нужен dmgbuild:  python3 -m pip install --user dmgbuild
"""
import os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS = ["Gosplugin Safari", "Kontur Safari", "CryptoPro Safari"]
VOLUME_NAME = "ЭЦП в Safari"
LSREGISTER = ("/System/Library/Frameworks/CoreServices.framework/Frameworks/"
              "LaunchServices.framework/Support/lsregister")


def run(*args, **kw):
    subprocess.run(list(args), check=True, **kw)


def build_apps(out_apps):
    env = dict(os.environ, DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer")
    dd = os.path.join(ROOT, "build", "release-dd")
    shutil.rmtree(dd, ignore_errors=True)
    for app in APPS:
        print("Сборка", app)
        run("xcodebuild", "-project", os.path.join(ROOT, app, app + ".xcodeproj"),
            "-scheme", app, "-configuration", "Release", "-derivedDataPath", dd,
            "CODE_SIGN_IDENTITY=-", "CODE_SIGN_STYLE=Manual", "DEVELOPMENT_TEAM=",
            "PROVISIONING_PROFILE_SPECIFIER=", "ONLY_ACTIVE_ARCH=NO", "build",
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        built = os.path.join(dd, "Build", "Products", "Release", app + ".app")
        run("ditto", built, os.path.join(out_apps, app + ".app"))
        # чтобы Safari не подхватывал расширения из папок сборки
        subprocess.run([LSREGISTER, "-u", built], stderr=subprocess.DEVNULL)
        subprocess.run([LSREGISTER, "-u", os.path.join(out_apps, app + ".app")], stderr=subprocess.DEVNULL)
    shutil.rmtree(dd, ignore_errors=True)


def build_dmg(out, out_apps):
    res = os.path.join(ROOT, "build", "release-res")
    shutil.rmtree(res, ignore_errors=True)
    os.makedirs(res)
    run("swift", os.path.join(ROOT, "tools", "dmg", "background.swift"), res, stdout=subprocess.DEVNULL)
    run("tiffutil", "-cathidpicheck", os.path.join(res, "background.png"),
        os.path.join(res, "background@2x.png"), "-out", os.path.join(res, "background.tiff"),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    dmg = os.path.join(out, "ESign-Safari.dmg")
    run(sys.executable, "-m", "dmgbuild", "-s", os.path.join(ROOT, "tools", "dmg", "settings.py"),
        "-D", "apps=" + out_apps, "-D", "res=" + res, VOLUME_NAME, dmg)
    shutil.rmtree(res, ignore_errors=True)
    print("  ->", dmg)


def main():
    out = os.path.join(ROOT, "build", "release")
    out_apps = os.path.join(out, "apps")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out_apps)
    build_apps(out_apps)
    build_dmg(out, out_apps)
    shutil.rmtree(out_apps, ignore_errors=True)


if __name__ == "__main__":
    main()
