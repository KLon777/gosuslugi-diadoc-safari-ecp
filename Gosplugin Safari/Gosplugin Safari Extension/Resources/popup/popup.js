console.debug("%cgosuslugi.plugin.extension.popup load", "font-weight: bold;");


document.addEventListener("DOMContentLoaded", () => { 

     const _ACTIONS = [
          { link: "module_to_main_link", tab: "main"   },
          { link: "about_to_main_link",  tab: "main"   },
          { link: "main_to_module_link", tab: "module" },
          { link: "main_to_about_link",  tab: "about"  }
     ];

     const _REQUEST = new GosuslugiPluginMessage("popup", "system", "config", "", "", "");

     function bindAction(id, action, handler) {
          const element = document.getElementById(id);
          if (element) {
               element.addEventListener(action, handler);
          }
          return !!element;
     };

     function changeTab(tab) {
          $(`div.anchor`).removeClass("active");
          $(`div.anchor#${tab}`).addClass("active");
     };

     function compareVersions(lhs, rhs) {
         return Math.sign(lhs.split('.').reduce((diff, num, i) => 
             diff || num - (rhs.split('.')[i] || 0), 0));
     };

     function fetchData(message) {

        const UNLOADED_CODES = [
          error_handler.ERRORS.PROTOCOL_WEB_SOCKET_NOT_FOUND.code
        ];

        const UNEXIST_CODES = [
          error_handler.ERRORS.PROTOCOL_NATIVE_HOST_NOT_FOUND.code
        ];

        const IGNORED_CODES = [
            error_handler.ERRORS.PROTOCOL_CONNECTION_CLOSED.code,
            error_handler.ERRORS.PROTOCOL_NATIVE_HOST_LOST.code,
        ];

        const { method: { type, result }, code, error } = message;

        const states = {
            exist: !UNEXIST_CODES.includes(+code),
            load:  !UNEXIST_CODES.includes(+code) && !UNLOADED_CODES.includes(+code),
            process: !IGNORED_CODES.includes(+code) && (type == _REQUEST.method.type),
            success: !(error ?? "").length,
        };

        if (states.process) {
               let data = { 
                    load: false,
                    exist: false,
                    update: false,
                    obsolete: false,
                    unsupported: false,
                    error: "",
                    version: "",
                    install: {},
                    modules: [],
               };

               data.load = states.load;
               data.exist = states.exist;
               data.install = result.install;
               data.error = error;

               if (states.success) {
                    data.modules = result.config.map(each => ({
                         type:    each.format.type,
                         version: each.format.version
                    }));

                    const coreVersion = result.config.find(each => each.format.type === "core")?.format.version || "";
                    const extensionVersion = result.install?.update?.release || "";
                    const supportedVersion = result.install?.update?.min || "";

                    data.version = coreVersion;
                    data.update = !!compareVersions(extensionVersion, coreVersion);

                    if (data.update) {
                         data.obsolete = compareVersions(supportedVersion, coreVersion) < 0;   
                         data.unsupported = !data.obsolete;                                      
                    }
               }

               return data;
        }

        return null;
     };

     function updateLayout(data) {
          let element;

          if (element = document.getElementById("overlay_frame")) {
               element.style.display = "none";
         }

         if (element = document.getElementById("obsolete_frame")) {
             element.style.display = data?.obsolete ? "block" : "none";
         }

          if (element = document.getElementById("unsupported_frame")) {
               element.style.display = data?.unsupported ? "block" : "none";
          }

          if (element = document.getElementById("error_frame")) {
               element.style.display = data?.error?.length ? "block" : "none";              
          }

          if (element = document.getElementById("error_text")) {
               element.textContent = data?.error;               
          }          

          if (element = document.getElementById("version_text")) {
               element.textContent = data?.version ? data.version : 'данные не получены';               
          }

          if (element = document.getElementById("main_to_module_link")) {
               element.style.display = data?.load ? "block" : "none";               
          }

          if (element = document.getElementById("modules_frame")) {
               let template = document.createElement("div");

               element.innerHTML = data.modules.length ? '' : 'данные не получены';
               element.appendChild(template);

               data?.modules.forEach(each => {
                    let item = document.createElement('p');
                    item.classList.add('text');
                    item.textContent = `${each.type}: ${each.version}`;
                    template.appendChild(item);
               });
          }

          if (element = document.getElementById("download_button")) {
               element.style.display = !data?.exist || data?.update ? "block" : "none"; 
               element.innerHTML = data?.update ? "Обновить" : "Установить";   

               element.addEventListener("click", () => {
                    window.open(data?.install?.update?.link);
               });           
          } 
     };

     _ACTIONS.forEach(each => {
          bindAction(each.link, "click", () => changeTab(each.tab));
     });

     chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          const data = fetchData(message);
          if(data) updateLayout(data);

          sendResponse(null);
     });

     setTimeout(() => { document.getElementById("overlay_frame").style.display = "none"; }, 5000);

     chrome.runtime.sendMessage(_REQUEST);
});