console.debug("%cgosuslugi.plugin.extension.bootstrap load", "font-weight: bold;");


if (typeof _bootstrap_0db7d9ec48754f9080a77e237238453b === 'undefined') {
    (function (global) {
        const _ID = "gosuslugi.plugin.extension.bootstrap";

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

        const _ORIGINAL = _CONTEXT ? _CONTEXT.bootstrap : null;

        const _PATH = (() => {
            if (_DOCUMENT) {
                const currentScript = _DOCUMENT.currentScript;
                if (currentScript) {
                    const scriptPath = currentScript.src;
                    return scriptPath.substring(0, scriptPath.lastIndexOf('/') + 1);
                }
            }
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                return chrome.runtime.getURL('includes/');
            }
            return '';
        })();

        const _SCRIPTS = [
            { key: "system",         id: "gosuslugi.plugin.extension.system",         value:         "_system_0db7d9ec48754f9080a77e237238453b", dependencies: ["formats"], path: "system.js"         },
            { key: "crypto",         id: "gosuslugi.plugin.extension.crypto",         value:         "_crypto_0db7d9ec48754f9080a77e237238453b", dependencies: ["formats"], path: "crypto.js"         },
            { key: "crypto_wrapper", id: "gosuslugi.plugin.extension.crypto_wrapper", value: "_crypto_wrapper_0db7d9ec48754f9080a77e237238453b", dependencies: ["crypto"],  path: "crypto_wrapper.js" },
            { key: "bootstrap",      id: "gosuslugi.plugin.extension.bootstrap",      value:      "_bootstrap_0db7d9ec48754f9080a77e237238453b", dependencies: [],          path: "bootstrap.js"      },
            { key: "formats",        id: "gosuslugi.plugin.extension.formats",        value:        "_formats_0db7d9ec48754f9080a77e237238453b", dependencies: [],          path: "formats.js"        }
        ];

        let _prefix;

        let _exists = function(name) {
            let results = [];
            let result = false;

            if (name) {
                const script = _SCRIPTS.find(script => script.value === name);
                result = script ? typeof _CONTEXT[name] !== 'undefined' : false;
            }
            else {
                results = _SCRIPTS
                    .filter(script => typeof _CONTEXT[script.value] !== 'undefined')
                    .map(script => ({ module: script.key, id: script.id, path: script.path, caller: _CALLER }));              
            }
 
            return name  ? result : results;
        };
        
        let _registered = function(id) {
            let results = [];
            let result = false;

            if (_DOCUMENT && _DOCUMENT.head) {
                const tags = _DOCUMENT.head.querySelectorAll('meta[content="extension"]');
                for (const meta of Array.from(tags)) {
                    const property = meta.getAttribute('property');

                    if (property && property.startsWith("gosuslugi.plugin.extension.")) {
                        if (id && property == id) {
                            result = true;
                            break;
                        }
                        results.push(property);
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

        const _bootstrap_0db7d9ec48754f9080a77e237238453b = {
            caller: function() {
                return _CALLER;
            },

            context: function() {
                return _CONTEXT;
            },
            
            document: function() {
                return _DOCUMENT;
            },

            original: function() {
                return _ORIGINAL;
            },

            exists: function(name) {
                return _exists(name);
            },

            registered: function(id) {
                return _registered(id);
            },

            register: function(id) {
                return _register(id);
            },

            init: function(id) {
                return _init(id);
            },

            loadScripts: async function(scriptList) {
                const keyByName   = (name) => { return name.replace('.js', ''); };
                const scriptByKey = (key) =>  { return _SCRIPTS.find(script => script.key === key); };
                const currentTime = () => {
                        const now = new Date();
                        return now.toLocaleTimeString('ru-RU', { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit'
                        });
                    };

                const loadScript = (script) => {
                    return new Promise((resolve, reject) => {
                        if (this.registered(script.id)) {
                            resolve({script: script.path, status: 'exists', time: currentTime()});
                            return;
                        }

                        if (_DOCUMENT) {
                            const scriptElement = document.createElement('script');
                            scriptElement.src = _PATH + script.path;
                            scriptElement.onload = () => {
                                resolve({script: script.path, status: 'success', time: currentTime()});
                            };
                            scriptElement.onerror = () => {
                                reject({script: script.path, status: 'error', time: currentTime(), error: new Error(`${_ID}: cannot load script: ${script.path}`)});
                            };
                            document.head.appendChild(scriptElement);
                        } else {
                            try {
                                importScripts(_PATH + script.path);
                                resolve({script: script.path, status: 'success', time: currentTime()});
                            } catch (e) {
                                reject({script: script.path, status: 'error', time: currentTime(), error: e});
                            }
                        }
                    });
                };

                if (!scriptList || !scriptList.length) {
                    scriptList = _SCRIPTS.map(script => script.path);
                }

                const requestedScripts = scriptList.map(name => keyByName(name));
                
                const loadOrder = [];
                const visited = new Set();
                const loading = new Set();

                const visit = (key) => {
                    if (loading.has(key)) {
                        throw new Error(`${_ID}: circular dependency detected: ${key}`);
                    }
                    if (visited.has(key)) {
                        return;
                    }

                    const script = scriptByKey(key);
                    if (!script) {
                        throw new Error(`${_ID}: script not found: ${key}`);
                    }

                    loading.add(key);
                    
                    for (const each of script.dependencies) {
                        visit(each);
                    }

                    loading.delete(key);
                    visited.add(key);

                    loadOrder.push(script);
                };

                requestedScripts.forEach(key => visit(key));

                const results = await (async () => {
                  let result = [];
                  for (const script of loadOrder) {
                    try {
                      const info = await loadScript(script);
                      result.push(info);
                    } catch (e) {
                      result.push(e);
                      console.warn(`${_ID}: cannot load ${script.path}`, e.error || e);
                    }
                  }
                  return result;
                })();

                const errors     = results.filter(r => r.status === 'error'  );
                const success    = results.filter(r => r.status === 'success');
                const exist      = results.filter(r => r.status === 'exists'  );

                if (errors.length > 0) {
                    console.warn(`${_ID}: сannot load scripts:`, 
                        errors.map(s => s.script).join(', '));
                } else {
                    console.info(`${_ID}: scripts loaded`);
                }

                return results;
            },

            loadAllScripts: async function() {
                return await this.loadScripts([]);
            },

            setPrefix: function(data) {
                const prefix = data?.prefix;
                const reset = data?.reset;

                const objectByName = (name) => { try { return eval(name); } catch (e) { return undefined; } };

                if (!prefix) {
                    console.warn('prefix value undefined');
                    throw new Error(`prefix value undefined`);
                }

                if (prefix == _prefix) {
                    console.warn('prefix value redefined');
                    throw new Error(`prefix value redefined`);
                }

                let result = [];

                _CONTEXT[prefix] = _CONTEXT[prefix] || {};

                for (const each of _SCRIPTS) {
                    const key = each.key;
                    const value = each.value;
                    
                    let object = objectByName(value);

                    if (object) {
                        _CONTEXT[prefix][key] = object;

                        if (reset) {
                            if (_CONTEXT[key] && _CONTEXT[key]?.original) {
                                _CONTEXT[key] = _CONTEXT[key]?.original?.();
                            }

                            if (_CONTEXT[key]?.caller?.()) {
                                console.warn(`${_ID}: сannot reset context[${key}]`); 
                            }

                            if (key == "crypto" && crypto) {
                                crypto = undefined;
                            }
                        }

                        if (key == "crypto_wrapper") {
                            _CONTEXT[prefix]["crypto"] = object;
                        }

                        result.push({
                          object: key,
                          reset: reset,
                          from: _prefix ? `${_prefix}.${key}` : null,
                          to: `${prefix}.${key}`
                        });
                    }
                }

                if (_prefix && _CONTEXT[_prefix]) {
                    delete _CONTEXT[_prefix];
                };

                _prefix = prefix;

                return result;
            },
        };
        if (typeof module !== "undefined" && module.exports) {
            module.exports = _bootstrap_0db7d9ec48754f9080a77e237238453b;
        } else if (typeof define === "function" && define.amd) {
            define(() => _bootstrap_0db7d9ec48754f9080a77e237238453b);
        } else if (typeof globalThis !== "undefined" && typeof globalThis.window === "undefined") {
            try {
                Object.defineProperty(global, '__esModule', { value: true });
                global._bootstrap_0db7d9ec48754f9080a77e237238453b = _bootstrap_0db7d9ec48754f9080a77e237238453b;
                global.bootstrap                                   = _bootstrap_0db7d9ec48754f9080a77e237238453b;
            } catch (e) {
                console.log('bootstrap: error in es modules');
            }
        } else {
            global._bootstrap_0db7d9ec48754f9080a77e237238453b = _bootstrap_0db7d9ec48754f9080a77e237238453b;
            global.bootstrap                                   = _bootstrap_0db7d9ec48754f9080a77e237238453b;
        }

    })(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
}
else {
    console.debug("%cgosuslugi.plugin.extension.bootstrap already exists", "font-weight: bold;");
}