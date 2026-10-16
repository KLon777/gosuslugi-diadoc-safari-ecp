const TEXT = {
    plugin: { true: "установлен", false: "не установлен", null: "неизвестно" },
    bridge: { true: "работает", false: "не отвечает", null: "неизвестно" },
    extension: { true: "включено", false: "выключено", null: "неизвестно" },
};
const state = {};

function setStatus(key, value) {
    state[key] = value;
    const li = document.getElementById(key);
    li.classList.remove("ok", "bad", "unknown");
    li.classList.add(value === true ? "ok" : value === false ? "bad" : "unknown");
    li.querySelector(".value").textContent = TEXT[key][String(value)];
    updateHint();
}

function updateHint() {
    const hint = document.getElementById("hint");
    if (state.plugin === false) {
        hint.textContent = "Сначала установите Госплагин — обычный установщик для macOS с сайта gosuslugi.ru.";
    } else if (state.bridge === false) {
        hint.textContent = "Мост не отвечает. Нажмите «Обновить»; если не помогло — перезапустите приложение. Лог: ~/Library/Logs/Gosplugin Safari bridge.log";
    } else if (state.extension === false) {
        hint.textContent = "Включите расширение: «Открыть настройки Safari…» → поставьте галочку → «Изменить сайты…» → Разрешить.";
    } else if (state.plugin && state.bridge && state.extension) {
        hint.textContent = "Всё готово. Вход по ЭЦП в Safari должен работать.";
    } else {
        hint.textContent = "";
    }
}

function post(msg) { webkit.messageHandlers.controller.postMessage(msg); }

document.getElementById("open").addEventListener("click", () => post("open-preferences"));
document.getElementById("refresh").addEventListener("click", () => post("refresh"));
document.getElementById("uninstall").addEventListener("click", (e) => { e.preventDefault(); post("uninstall"); });
