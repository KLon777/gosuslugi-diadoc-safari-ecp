console.debug("%cgosuslugi.plugin.extension.system load", "font-weight: bold;");


if (typeof _system_0db7d9ec48754f9080a77e237238453b === 'undefined') {
    (function (global) {
         const _ID = "gosuslugi.plugin.extension.system";

         const _DOCUMENT = (() => {
             try {
                 return typeof document !== 'undefined' ? document : null;
             } catch (e) {
                 console.warn(`${_ID}: cannot access document: `, e.message || e); 
                 return null;
             }
         })();

         const _CONTEXT = (() => {
             try {
                 return typeof window !== 'undefined' ? window :
                        typeof global !== 'undefined' ? global :
                        typeof self   !== 'undefined' ? self : {};

             } catch (e) {
                 console.warn(`${_ID}: cannot access context: `, e.message || e);  
                 return null;
             }
         })();

        const _CALLER = (() => {
            const hasWindow   = typeof window   !== 'undefined';
            const hasDocument = typeof document !== 'undefined';
            const hasGlobal   = typeof global   !== 'undefined';
            const hasBrowser  = typeof chrome  !== 'undefined';
            
            const hasExtension = hasBrowser && chrome.extension;
            const hasRuntime   = hasBrowser && chrome.runtime;
            
            const isExtensionUrl = hasWindow && window.location && window.location.protocol === 'chrome-extension:';
            
            if (hasExtension && hasRuntime) {
                if (hasDocument && hasRuntime && !isExtensionUrl) {
                    return "content.js";
                }
            }
            
            if (hasWindow && hasDocument && !isExtensionUrl) {
                return "web-page";
            }
            
            return "background.js";
        })();

        const _WEB_PAGE = _CALLER == "web-page";
         
         const _ORIGINAL = _CONTEXT ? _CONTEXT.gosuslugiPluginSystem : null;

          let _callbacks = {};

         let _registered = function(id) {
             let results = [];
             let result = false;

             if (_DOCUMENT && _DOCUMENT.head) {
                 const tags = _DOCUMENT.head.querySelectorAll('meta[content="extension"]');
                 for (const meta of Array.from(tags)) {
                     const property = meta.getAttribute('property');

                     if (property && property.startsWith("gosuslugi.plugin.extension.")) {
                         const candidate = property.replace("gosuslugi.plugin.extension.", "");
                         if (id && candidate == id) {
                             result = true;
                             break;
                         }
                         results.push(candidate);
                     }
                 }
             }
             return id  ? result : results;
         };

         let _register = function(id) {
             if (_DOCUMENT) {
                 let meta = _DOCUMENT.createElement('meta');
                 meta.setAttribute('content', 'extension');
                 meta.setAttribute('property', id);

                 let elements = _DOCUMENT.getElementsByTagName('head');
                 if (elements.length) {
                     elements[0].appendChild(meta);
                     console.info(`${_ID}: ${id} registered in web page`);
                 }
             }
             else {
                 console.warn(`${_ID}: ?annot register ${id}, cause ?annot access document`);            
             }
         };

         let _init = function(id) {
            if (_DOCUMENT && _WEB_PAGE) {
                if (_registered(id)) {
                    console.warn(`${_ID}: ${id} already registered in web page`);
                }
                else {
                    _register(id);
                }             
            }

            console.info(`${_ID}: caller: ${_CALLER}`);
             
             window.addEventListener("message", (event) => {
                  let message = event.data;
                  if(message.node && message.id) {
                       let callback = _callbacks[ message.id ];
                       if (!!callback) {
                            callback(message);
                            delete _callbacks[message.id];
                       }
                  }
             });
          };

          _init(_ID);

          const _system_0db7d9ec48754f9080a77e237238453b = {
               caller: function() {
                    return _CALLER;
               },

               original: function() {
                    return _ORIGINAL;
               },

               post: function(message, callback) {
                    if (callback) {
                         _callbacks[message.id] = callback;
                    }
                    window.postMessage(message, '*');
               },

               handshake: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "handshake", "");
                    this.post(message, callback);
               },

               echo: function (value, callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "echo", value);
                    this.post(message, callback);
               },

               cache: function (value, callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "cache", value);
                    this.post(message, callback);
               },

               lastError: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "lastError", "");
                    this.post(message, callback);
               },

               config: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "config", "");
                    this.post(message, callback);
               },

               ipConfig: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "ipConfig", "");
                    this.post(message, callback);
               },

               close: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "close", "");
                    this.post(message, callback);
               },

               protocol: function (callback) {
                    let message = new GosuslugiPluginMessage(_ID, "system", "protocol", "");
                    this.post(message, callback);
               },
          };
        if (typeof module !== "undefined" && module.exports) {
            module.exports = _system_0db7d9ec48754f9080a77e237238453b;
        } else if (typeof define === "function" && define.amd) {
            define(() => _system_0db7d9ec48754f9080a77e237238453b);
        } else if (typeof globalThis !== "undefined" && typeof globalThis.window === "undefined") {
            try {
                Object.defineProperty(global, '__esModule', { value: true });
                global._system_0db7d9ec48754f9080a77e237238453b = _system_0db7d9ec48754f9080a77e237238453b;
                global.gosuslugiPluginSystem                                   = _system_0db7d9ec48754f9080a77e237238453b;
            } catch (e) {
                console.log('system: error in es modules');
            }
        } else {
            global._system_0db7d9ec48754f9080a77e237238453b = _system_0db7d9ec48754f9080a77e237238453b;
            global.gosuslugiPluginSystem                                   = _system_0db7d9ec48754f9080a77e237238453b;
        }

    })(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
}
else {
    console.debug("%cgosuslugi.plugin.extension.system already exists", "font-weight: bold;");
}