# Настройки dmgbuild. Вызывается из tools/build_release.py:
#   dmgbuild -s tools/dmg/settings.py -D apps=DIR -D res=DIR "ЭЦП в Safari" OUT.dmg
import os

apps_dir = defines["apps"]  # noqa: F821
res_dir = defines["res"]  # noqa: F821

format = "UDZO"
filesystem = "HFS+"
size = None

files = [
    os.path.join(apps_dir, "Gosplugin Safari.app"),
    os.path.join(apps_dir, "Kontur Safari.app"),
    os.path.join(apps_dir, "CryptoPro Safari.app"),
]
symlinks = {"Программы": "/Applications"}
hide_extensions = ["Gosplugin Safari.app", "Kontur Safari.app", "CryptoPro Safari.app"]

background = os.path.join(res_dir, "background.tiff")
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
window_rect = ((200, 80), (660, 635))  # 600 видимой области + заголовок и строка состояния
default_view = "icon-view"
show_icon_preview = False
icon_size = 88
text_size = 13
arrange_by = None
label_pos = "bottom"

icon_locations = {
    "Gosplugin Safari.app": (150, 160),
    "Kontur Safari.app": (150, 285),
    "CryptoPro Safari.app": (150, 410),
    "Программы": (510, 285),
}
