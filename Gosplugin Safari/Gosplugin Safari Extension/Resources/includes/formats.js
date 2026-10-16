console.debug("%cgosuslugi.plugin.extension.formats load", "font-weight: bold;");


const GosuslugiPluginModule = class {
     constructor( type, version ) {
          this.type = type;
          this.version = version;
     }
};

const GosuslugiPluginFileInfo = class {
     constructor( content, path, contentEncoding, id, name, contentFormat ) {
          this.content = content;
          this.path = path;

          this.id = id || "";
          this.name = name || "";

          this.contentEncoding = contentEncoding || "";
          this.contentFormat = contentFormat || "";
     }
};

const GosuslugiPluginMethod = class {
     constructor( type, data, result ) {
          this.type = type;
          this.data = data;
          this.result = result || "";
     }
};

const GosuslugiPluginFormat = class {
     constructor( type, version, category ) {
          this.type = type;
          this.version = version;
          this.category = category;
     }
};

const GosuslugiPluginContent = class {
     constructor( type, charset, transferEncoding ) {
          this.type = type;
          this.charset = charset;
          this.transferEncoding = transferEncoding;
     }
};

const GosuslugiPluginRoute = class {
     constructor(node, time, transfer = "") {
          this.node = node;
          this.time = time;
          this.transfer = transfer;
     }
};

const GosuslugiPluginMeta = class {
     constructor( format, content ) {
          this.format = format;
          this.content = content;
          this.routes = [];
          this.data = {};
          this.userAgent = (typeof window !== "undefined" ? window : self).navigator?.userAgent || "Unknown";
     }
};

const GosuslugiPluginDependency = class {
     constructor(type, version) {
          this.type = type;
          this.version = version;
     }
};

const GosuslugiPluginConfig = class {
     constructor() {
          this.type = "";
          this.description = "";
          this.state = "";

          this.format = new GosuslugiPluginFormat("", "", "");

          this.dependencies = [];
          this.methods = [];
     }
};

const GosuslugiPluginNameInfo = class {
     constructor() {
          this.name ="";
          this.lastName ="";
          this.firstAndMiddleName ="";
          this.email ="";
          this.snils ="";
          this.companyName ="";
          this.organizationName ="";
          this.inn ="";
          this.kpp ="";
          this.ogrn ="";
          this.ogrnip ="";
          this.post ="";
          this.street ="";
          this.region ="";
          this.city ="";
          this.country ="";
     }
};

const GosuslugiPluginMessage = class {
     constructor(owner, module, func, data = "", result = "", mode = "") {
          this.id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
               var r = Math.random() * 16 | 0, v = c == "x" ? r : (r & 0x3 | 0x8);
               return v.toString(16);
          });

          this.node = "";
          this.error = "";

          this.mode = mode || "";

          this.module = new GosuslugiPluginModule(module, "0.0.0.0");
          this.method = new GosuslugiPluginMethod(func, data, result);

          this.meta = new GosuslugiPluginMeta(
               new GosuslugiPluginFormat("message", "0.0.0.0", "gosuslugi.plugin"),
               new GosuslugiPluginContent("application/json", "utf8", "")
          );

          this.meta.routes.push(new GosuslugiPluginRoute(owner, new Date().toLocaleString()));
     }
};


if (typeof _formats_0db7d9ec48754f9080a77e237238453b === 'undefined') {
    (function (global) {
         const _ID = "gosuslugi.plugin.extension.formats";

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
         
         const _ORIGINAL = _CONTEXT ? _CONTEXT.formats : null;

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
                 console.warn(`${_ID}: сannot register ${id}, cause сannot access document`);            
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
         };

           _init(_ID);
         
         const _formats_0db7d9ec48754f9080a77e237238453b = {
             caller: function() {
                return _CALLER;
             },

            original: function() {
                return _ORIGINAL;
            },

             GosuslugiPluginModule,
             GosuslugiPluginFileInfo,
             GosuslugiPluginMethod,
             GosuslugiPluginFormat,
             GosuslugiPluginContent,
             GosuslugiPluginRoute,
             GosuslugiPluginMeta,
             GosuslugiPluginDependency,
             GosuslugiPluginConfig,
             GosuslugiPluginNameInfo,
             GosuslugiPluginMessage
         };

        if (typeof module !== "undefined" && module.exports) {
            module.exports = _formats_0db7d9ec48754f9080a77e237238453b;
        } else if (typeof define === "function" && define.amd) {
            define(() => _formats_0db7d9ec48754f9080a77e237238453b);
        } else if (typeof globalThis !== "undefined" && typeof globalThis.window === "undefined") {
            try {
                Object.defineProperty(global, '__esModule', { value: true });
                global._formats_0db7d9ec48754f9080a77e237238453b = _formats_0db7d9ec48754f9080a77e237238453b;
                global.formats                                   = _formats_0db7d9ec48754f9080a77e237238453b;
            } catch (e) {
                console.log('formats: error in es modules');
            }
        } else {
            global._formats_0db7d9ec48754f9080a77e237238453b = _formats_0db7d9ec48754f9080a77e237238453b;
            global.formats                                   = _formats_0db7d9ec48754f9080a77e237238453b;
        }

    })(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
}
else {
    console.debug("%cgosuslugi.plugin.extension.formats already exists", "font-weight: bold;");
}