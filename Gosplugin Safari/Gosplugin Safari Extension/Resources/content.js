console.debug("%cgosuslugi.plugin.extension.content load", "font-weight: bold;");


let content = (function () {
    const _ID = "gosuslugi.plugin.extension.content";
    const _MAX_NMH_MESSAGE_SIZE = 1024 * 1024;
    const _DEFAULT_CHUNK_SIZE = _MAX_NMH_MESSAGE_SIZE >> 1;

    const _PARTIAL_CONTENT_HTTP_STATUS = 206;

    const _SIGNATURE_MAXIMUM_SIZE = 10 * 1024;
    const _OUTPUT_MAXIMUX_SIZE = 10 * 1024 * 1024;
    const _FILE_MAXIMUM_SIZE = 100 * 1024 * 1024;

    const _DEFAULT_CHUNK_WAIT_TIMEOUT_MS = 60 * 1000;

    const _HASH_ALGORITHM = 'MD5';

    let _cache = {};
    let _timeouts = {};
    let _cancelChunks = false;
    let _chunkCache = {};

    let _ignored = new Set();

    let _chunkMetaInfo = [];
    let _chunkSize = _DEFAULT_CHUNK_SIZE;

    let protocolVersion = null;

    let _cloneInto = function(obj) {
        return (typeof cloneInto !== 'undefined') ? cloneInto(obj, window) : obj;
    };

    let _uuid = function() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c == "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    let _isBase64 = function(buffer) {
        const data = buffer.length ? buffer : String.fromCharCode.apply(null, new Uint8Array(buffer));
        if (!buffer || data.length % 4 !== 0) {
            return false;
        }
        const base64Regex = /^[A-Za-z0-9+/]+[=]{0,2}$/;
        return base64Regex.test(data);
    };

    let _url2Name = function(url) {
        return decodeURIComponent(url.substring(url.lastIndexOf('/') + 1));
    };

    let _metaChunk2Int = function(meta) {
        return +meta?.data?.chunk || 0;
    };

    let _buffer2Base64 = function(buffer) {
        const bytes = new window.Uint8Array(buffer);
        const length = bytes.byteLength;
        const chunkSize = 0x8000;
        const chunks = [];

        for (let i = 0; i < length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            chunks.push(String.fromCharCode.apply(null, chunk));
        }

        return window.btoa(chunks.join(''));
    };

    let _selectFileDialog = function() {
        let result = document.getElementById('crypto_selectFile');
        if (!result) {
            result = document.createElement('input');
            result.setAttribute('type', 'file');
            result.setAttribute('id', 'crypto_selectFile');
            result.setAttribute('multiple', '');
            result.style.display = 'none';

            document.body.appendChild(result);
        }
        return result;
    };

    let _split = function(str, mask) {
        let index = str.indexOf(mask);

        let begin = "";
        let end = "";

        if (~index) {
            index += mask.length;

            begin = str.substring(0, index);
            end = str.substring(index);
        }

        return [begin, end];
    };

    let _postChunk = function(message, data, uuid = "", chunks = -1) {
        message.meta = message.meta || {};

        const meta = message.meta;
        const chunk = _metaChunk2Int(meta) + 1;
        const first = (chunk === 1);
        const hash = {
            algorithm: _HASH_ALGORITHM,
            value: ""
        }

        if (!_cancelChunks && !first) {
            _cancelChunks = !_cache[message.id];
        }

        if (_cancelChunks) {
            error_handler.throw_error(error_handler.ERRORS.Cancelled.code);
        }
		
        if (data === undefined) {
            data = "";
        }

        if (data.length > _OUTPUT_MAXIMUX_SIZE) {
            error_handler.throw_error(error_handler.ERRORS.OutputSizeOverflow.code, `чанк: ${chunk}`);
        }

        if (uuid) {
            let chunkInfo = _chunkMetaInfo[uuid];
            if (!chunkInfo) {
                chunkInfo = {
                    checksum: new HashStream()
                };
                _chunkMetaInfo[uuid] = chunkInfo;
            }
            hash.value = chunkInfo.checksum.addData(data);
        }

        const metaData = meta.data;
        {
            metaData.chunk = String(chunk);
            metaData.chunks = String(chunks);

            if (uuid) {
                metaData.id = uuid;
                delete metaData.size;
            } else {
                delete metaData.id;
            }

            if (hash.value) {
                metaData.hash = JSON.stringify(hash);
            } else {
                delete metaData.hash;
            }
        }

        message.method.data = data;

        _request(message);
    };

    let _instanceOfFile = function(file) {
        return file instanceof File;
    }

    let _instanceOfUrl = function(file) {
        return file?.contentEncoding == "url";
    }

    let _instanceOfContent = function(file) {
        return file?.content && file?.content?.length;
    }

    let _instanceOfPath = function(file) {
        return file?.path && file?.path?.length;
    }

    let _handleError = function(message, error) {
        console.error('error handling:', error);

        error_handler.parse_message_error(message, error);
        _response(message);
    };

     let _handleCertificate = async function (request) {
          try {
               const hasArray = Array.isArray(request.certificates);
               const inputs = hasArray
                    ? (request.certificates || [])
                    : (request.certificate ? [request.certificate] : []);

               const results = [];

               for (const file of inputs) {
                    if (!file) continue;

                    let fileInfo = {
                         contentEncoding: "base64",
                         name: file.url || ""
                    };

                    if (_instanceOfFile(file)) {
                         const data = await new Promise((res, rej) => {
                              const reader = new FileReader();
                              reader.onload = e => res(e.target.result);
                              reader.onerror = rej;
                              reader.readAsArrayBuffer(file);
                         });

                         if (_isBase64(data)) {
                              fileInfo.content = new TextDecoder("utf-8").decode(data);
                         } else {
                              fileInfo.content = _buffer2Base64(data);
                         }
                         results.push(fileInfo);
                    } else if (_instanceOfUrl(file)) {
                         const response = await fetch(file.path, {
                              headers: {
                                   "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                                   "Pragma": "no-cache",
                                   "Expires": "0"
                              }
                         });

                         if (!response.ok) {
                              error_handler.throw_error(response.status, `ошибка загрузки сертификата ${file.path}`);
                         }

                         const data = await response.arrayBuffer();
                         if (_isBase64(data)) {
                              fileInfo.content = new TextDecoder("utf-8").decode(data);
                         } else {
                              fileInfo.content = _buffer2Base64(data);
                         }
                         results.push(fileInfo);
                    } else {
                         results.push(file);
                    }
               }
			   
               if (hasArray) {
                    request.certificates = _cloneInto(results);
               } else if (request?.certificate !== undefined) {
                    if (results[0]) {
                         request.certificate = _cloneInto(results[0]);
					}
               }
               return request;

          } catch (error) {
               console.error("certificate handling error:", error);
               throw error;
          }
     };

    let _sizeFile = async function(file) {
        return file.size || 0;
    }

    let _sizeContent = async function(file) {
        return file.content ? file.content.length : 0;
    }

    let _sizeUrl = async function(file) {
        const methods = [
            async function byContentLength(url) {
                    const response = await fetch(url, {
                        method: 'HEAD',
                        headers: {
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0'
                        }
                    });
                    if (response.ok) {
                        const contentLength = response.headers.get('Content-Length');
                        return contentLength ? parseInt(contentLength, 10) : 0;
                    }
                    return 0;
                },
                async function byContentRange(url) {
                        const response = await fetch(url, {
                            method: 'GET',
                            headers: {
                                'Range': 'bytes=0-1'
                            }
                        });
                        const contentRange = response.headers.get('Content-Range');
                        if (contentRange) {
                            const sizeMatch = contentRange.match(/\/(\d+)$/);
                            if (sizeMatch) {
                                return parseInt(sizeMatch[1], 10);
                            }
                        }
                        return 0;
                    },
                    async function byController(url) {
                        const controller = new AbortController();
                        const {
                            signal
                        } = controller;

                        const response = await fetch(url, {
                            signal
                        });
                        if (response.ok) {
                            controller.abort();

                            const contentLength = response.headers.get('Content-Length');
                            return contentLength ? parseInt(contentLength, 10) : 0;
                        }
                        return 0;
                    }
        ];

        let result = 0;
        let url = file.path;

        for (let method of methods) {
            try {
                result = await method(url);
                if (result > 0) {
                    break;
                }
            } catch (error) {
                console.warn('Unable fetching file: ', error);
                result = 0;
            }
        }

        if (0 == result) {
            console.warn(`Unable fetching file size for ${url}, set default minimum size 1`);
            result = 1;
        }

        return result;
    }

    let _sizePath = async function(file) {
        return file.path ? file.path.length : 0;
    }

    let _handleFile = async function(message, file, uuid) {
        let position = 0;
        const reader = new FileReader();

        return new Promise((resolve, reject) => {
            reader.onload = async () => {
                await _postChunk(message, reader.result.split(',')[1], uuid);
                position += _chunkSize;

                if (position < file.size) {
                    readChunk();
                } else {
                    delete _chunkMetaInfo[uuid];
                    resolve(`loading file ${file.name} finished`);
                }
            };

            reader.onerror = () => reject(reader.error);

            function readChunk() {
                reader.readAsDataURL(file.slice(position, position + _chunkSize, file.type));
            }

            readChunk();
        });
    };

    let _handleUrl = async function(message, file, uuid) {
        const url = file.path;
        if (url.trim() === "") {
             error_handler.throw_error(error_handler.ERRORS.FileNotFound.code);
        }
        const reader = new FileReader();

        let position = 0;
        async function readChunk(resolve, reject) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'Range': `bytes=${position}-${position + _chunkSize - 1}`,
                        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });

                if (!response.ok && response.status !== _PARTIAL_CONTENT_HTTP_STATUS) {
                    reject(new Error(JSON.stringify({
                        status: response.status,
                        message: `ошибка загрузки файла ${url}`
                    })));
                    return;
                }

                const blob = await response.blob();

                reader.onload = async () => {
                    await _postChunk(message, reader.result.split(',')[1], uuid);
                    position += _chunkSize;
                    const contentRange = response.headers.get('Content-Range');
                    const totalSize = contentRange ? parseInt(contentRange.split('/')[1]) : 0;

                    if (position < totalSize) {
                        readChunk(resolve, reject);
                    } else {
                        delete _chunkMetaInfo[uuid];
                        resolve(`loading url ${url} finished`);
                    }
                };

                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            } catch (error) {
                console.error(`loading url ${url} failed:`, error);
                reject(new Error(JSON.stringify({ code: error_handler.ERRORS.FileNotFound.code })));
            }
        }

        return new Promise((resolve, reject) => {
            readChunk(resolve, reject);
        });
    };

    let _handlePath = async function(message, file, uuid) {
        await _postChunk(message, JSON.stringify(file), uuid);
    }

    let _handleContent = async function(message, file, uuid) {

        const single = file.content.length < _chunkSize;

        if (single) {
            await _postChunk(message, JSON.stringify(file), uuid);
        } else {
            for (let i = 0; i < file.content.length; i += _chunkSize) {
                const content = file.content.slice(i, i + _chunkSize);
                await _postChunk(message, content, uuid);
            }

            delete _chunkMetaInfo[uuid];
        }
    }

    let _handleQueue = async function(message, files) {
        let request = JSON.parse(message.method.data);
        let encodings = [];

        const hashType = (() =>{
             if (message.method.type == "hash")
                  return true;
             return false;
        })();

        const requestFiles = [];

        const [beginRequest, endRequest] = _split(JSON.stringify(request), '"files":[');

        try {
            const getType = (file) => {
                let result = request.type;
                if (file.id) {
                    if (request.filesSignParams) {
                        for (let param of request.filesSignParams) {
                            if (file.id == param.id) {
                                result = param.type;
                                break;
                            }
                        }
                    }
                }
                return result;
            };

            let likelyTotalInputSize = 0;
            let likelyTotalOutputSize = 0;

            let _fileInfoFromFile = function(file) {
                return {
                    contentEncoding: "url",
                    name: file.name,
                    content: ""
                };
            }

            let _fileInfoFromUrl = function(file) {
                return {
                    contentEncoding: "url",
                    id: file.id,
                    contentFormat: file.contentFormat,
                    name: _url2Name(file.path),
                    content: ""
                };
            }

            let _fileInfoFromPath = function(file) {
                return file;
            }

            let _fileInfoFromContent = function(file) {
                const single = file.content.length < _chunkSize;
                return single ? file : {
                                            contentFormat: file.contentFormat,
                                            id: file.id,
                                            contentEncoding: file.contentEncoding,
                                            name: file.name,
                                            content: ""
                                       };
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[ i ];

                let fileSize = 0;
                let fileInfo = {};
                let type = getType(file);

                if      (_instanceOfFile    (file)) { fileInfo = _fileInfoFromFile   (file); fileSize = await _sizeFile   (file); }
                else if (_instanceOfUrl     (file)) { fileInfo = _fileInfoFromUrl    (file); fileSize = await _sizeUrl    (file); }
                else if (_instanceOfContent (file)) { fileInfo = _fileInfoFromContent(file); fileSize = await _sizeContent(file); }
                else                                { fileInfo = _fileInfoFromPath   (file); fileSize = await _sizePath   (file); }

                if (0 == fileSize) error_handler.throw_error(error_handler.ERRORS.FileNotFound.code);

                let specialType = false;

                if (!hashType) {
                     const specialEncoding = _instanceOfFile(file) || _instanceOfUrl(file);
                     const specialCase = _instanceOfPath(file) && !_instanceOfUrl(file);
                     specialType = "detached" == type;

                     likelyTotalInputSize += fileSize;

                     if (!specialCase) {
                          likelyTotalOutputSize += _SIGNATURE_MAXIMUM_SIZE;

                          if (!specialType) {
                               likelyTotalOutputSize += fileSize;
                               if (specialEncoding) {
                                    likelyTotalOutputSize += fileSize / 3;
                               }
                          }
                     }
                }

                if ((fileSize > _FILE_MAXIMUM_SIZE) && !specialType) error_handler.throw_error(error_handler.ERRORS.FileSizeOverflow.code);
                if (likelyTotalOutputSize > _OUTPUT_MAXIMUX_SIZE   ) error_handler.throw_error(error_handler.ERRORS.OutputSizeOverflow.code);
            
                encodings.push(fileInfo.contentEncoding); 
                fileInfo.id = fileInfo.id?.trim() || "uuid_" + _uuid();

                requestFiles.push(fileInfo);
            }

            if (hashType) {
                 request.file = requestFiles[0];
            } else {
                 request.files = requestFiles;
            }

            ((message.meta ??= {}).data ??= {}).size ??= String(likelyTotalInputSize+likelyTotalOutputSize);
            await _postChunk(message, JSON.stringify(request));

            for (let i = 0; i < files.length; i++) {

                const file     = files[ i ];
                const fileInfo = requestFiles[i];
                const encoding = encodings[ i ];

                const uuid = fileInfo.id;

                ((message.meta ??= {}).content ??= {}).transferEncoding = encoding;

                if      (_instanceOfFile    (file)) await _handleFile   (message, file, uuid);
                else if (_instanceOfUrl     (file)) await _handleUrl    (message, file, uuid);
                else if (_instanceOfContent (file)) await _handleContent(message, file, uuid);
                else                                await _handlePath   (message, file, uuid);
            }
        } catch (error) {
            _handleError(message, error);
        }

        const chunkCount = _metaChunk2Int(message.meta) + 1;

        await _postChunk(message, "", "", chunkCount);
    };

    let _handleRequest = function(message, request) {
        console.log("handling request");

        _cancelChunks = false;

        message.method.data = JSON.stringify(request);

        const noStreamingMode = (() =>{
             const _STREAM_SUPPORTED_METHODS = ['signature', 'signatureV2', 'encrypt', 'decrypt', 'hash'];
             if (_STREAM_SUPPORTED_METHODS.includes(message.method.type))
                  return false;
             return true;
        })();

        const emptyFilesMessage = (request?.files && request.files.length === 0) || (request?.file && request.file.length === 0);

        const singleChunkMessage = (() => {
            let files = [];

            if (message.method.type == "hash") {
                 if (!request?.file) return false;
                 files = [request.file];
            }
            else {
                 if (!request?.files?.length) return false;
                 files = request.files;
            }

            let size = 0;

            for (const file of files) {
                if (_instanceOfFile(file)) return false;
                if (_instanceOfUrl(file )) return false;

                if ((size += file.content?.length ?? 0) > _DEFAULT_CHUNK_SIZE) return false;
            }  

            return true;
        })();

        if (noStreamingMode) {
            console.log("process single request");
           _request(message);
        }
        else if (emptyFilesMessage) {
            console.log("process request empty files signature");

            let selectFile = _selectFileDialog();

            selectFile.onchange = (event) => {

                const files = event.target.files;
                _handleQueue(message, files);
                event.target.remove();
            };
            selectFile.click();

        } else if (typeof request.meta !== 'undefined') {

            console.log("process chunk request signature, chunk " + request?.meta?.data?.chunk + " from " + (request?.meta?.data?.chunks || "-1"));

            let proxyMessage = { ...message };
            proxyMessage.method.data = "";

            const messageMetaData = proxyMessage?.meta?.data || {};
            const requestMetaData =      request?.meta?.data || {};

            messageMetaData.chunk   = String(_metaChunk2Int(request?.meta) - 1);
            messageMetaData.chunks  = String(requestMetaData?.chunks );
            messageMetaData.execute = String(requestMetaData?.execute);
            messageMetaData.id      = requestMetaData?.id;

            delete request.meta;

            const last = requestMetaData?.chunk == requestMetaData?.chunks;
            const data = last ? String() : (request.data || JSON.stringify(request));

            _postChunk(proxyMessage, data, messageMetaData.id, messageMetaData.chunks);

        } else if (singleChunkMessage) {
            console.log("process single chunk request");
            _request(message);          
        } else {
            console.log("process queued stream request");
             let files = request.files ?? [request.file];
            _handleQueue(message, files);
        }
    };

    let _request = function (message) {
        const id = message.id;

        if (_ignored.has(id)) {
            console.warn(`${_ID} ignore message, id: ${id}`);

            message = null;

            return;
        }

         const serializedMessage = JSON.parse(JSON.stringify(message));
         if (serializedMessage.meta?.format?.category !== "gosuslugi.plugin") {
              let data = (serializedMessage.meta ??= {}).data ??= {};
              data.domain = window.location.hostname;
         }

         if (serializedMessage.mode == "debug") {
              console.info(_ID + " send to background message: " + JSON.stringify(serializedMessage));
         } else {
              console.info(_ID + " send to background message, id: " + serializedMessage.id);
         }

        chrome.runtime.sendMessage(serializedMessage);
        const data = message?.meta?.data;
        if (data) {

            const execute = ("1" == data?.execute);

            if (execute) {
                const firstChunk = (data?.chunk != data?.chunks) && ("1" == data?.chunk);
                const lastChunk  = (data?.chunk == data?.chunks);
                const nextChunk = !lastChunk;

                if (firstChunk) {
                    _timeouts[id] = null;         
                }

                if (id in _timeouts) {

                    const delay = data?.timeout ? +data.timeout : _DEFAULT_CHUNK_WAIT_TIMEOUT_MS;
                    const timeout = _timeouts[id];

                    if (timeout) {
                        clearTimeout(timeout);
                    }

                    if (nextChunk) {
                        _timeouts[id] = setTimeout(() => {
                            /*
                                to core
                            */
                            {
                                let cancelMessage = new GosuslugiPluginMessage(_ID, "crypto", "signature", "");
                                cancelMessage.id = id;
                                cancelMessage.meta.data = {"chunk": "-1", "chunks": "-1", "execute": "1"};
                                chrome.runtime.sendMessage(cancelMessage); 
                            }

                            /*
                                to page
                            */
                            {
                                let responseMessage = new GosuslugiPluginMessage(_ID, "crypto", "signature", "");
                                responseMessage.id = id;
                                error_handler.set_message_error(responseMessage, error_handler.ERRORS.TransferChunkError.code);
                                _response(responseMessage);
                            }

                            _ignored.add(id);

                            delete _timeouts[id];

                        }, delay );
                    } else {
                        delete _timeouts[id];     
                    }
                }
            }
        }

        message = null;
    }

    let _response = function (message) {
        if (protocolVersion === null && !!message?.meta?.protocol?.version) {
            protocolVersion = message.meta.protocol.version.split('.');
        }
        const id = message.id;
        const cached = _cache[id];

        if (_ignored.has(id)) {
            console.warn(`${_ID} ignore message, id: ${id}`);

            message = null;

            return;        
        }

        if (cached) {
            if (message.mode == "debug") console.info(_ID + " send to web page  message: " + JSON.stringify(message));
            else                         console.info(_ID + " send to web page  message, id: " + id);

            /*/
            // commented, cause firefox restrictions
            message.meta.routes.push(new GosuslugiPluginRoute(_ID, new Date().toLocaleString()));
            /*/
            const serializedMessage = JSON.parse(JSON.stringify(message));
            if (serializedMessage.meta && serializedMessage.meta.routes) {
                serializedMessage.meta.routes.push({
                    node: _ID,
                    time: new Date().toLocaleString(),
                    transfer: ""
                });
            } else {
                console.error('message.meta.routes not found');
                serializedMessage.meta = serializedMessage.meta || {};
                serializedMessage.meta.routes = [{
                    node: _ID,
                    time: new Date().toLocaleString(),
                    transfer: ""
                }];
            }

            serializedMessage.node = cached;
            serializedMessage.method.data = null;

            window.postMessage(serializedMessage);

            delete _cache[id];
            
            message = null;
            /**/
        }
    }

    let _init = function() {
        document.addEventListener("DOMContentLoaded", function() {
            if (bootstrap.registered(_ID)) {
                console.warn(_ID + " web page already registered extension, injection of current extension skipped");
                _request(new GosuslugiPluginMessage(_ID, "system", "disconnect"));
            } else {
                 bootstrap.register(_ID);
                 _request(new GosuslugiPluginMessage(_ID, "system", "config"));

                 window.addEventListener("message", (event) => {
                     let message = event?.data;
                     let meta = message?.meta;
                     let type = message?.method?.type;
                     let data = message?.method?.data;

                     if (meta?.format?.category === "gosuslugi.plugin") {

                         if (message?.node === "") {
                             const id = message.id;
                             const route = meta.routes?.[0]?.node;
                             if (!!meta?.chunk) {
                                if (
                                    protocolVersion !== null
                                    && protocolVersion[1] == "3"
                                    && parseInt(protocolVersion[2]) <= 19
                                ) {
                                    _cache[id] = route;
                                    _request(message);
                                    return;
                                }
                                if (!_chunkCache[id]) { _chunkCache[id] = { "fileData": [], "fileId": "uuid_" + _uuid() }; }
                                if (_isBase64(data)) {
                                    _chunkCache[id][parseInt(meta?.chunk)] = "";
                                    _chunkCache[id]["fileData"].push("");
                                    const hash = {
                                        algorithm: _HASH_ALGORITHM,
                                        value: (new HashStream()).addData(data),
                                    };
                                    message.method.data = data;
                                    message.meta.data = _cloneInto({
                                        "chunk": (parseInt(meta?.chunk) - 2).toString(),
                                        "chunks": "-1",
                                        "id": _chunkCache[id]["fileId"],
                                        "hash": JSON.stringify(hash),
                                    });
                                    message.meta.content = _cloneInto({
                                        "type": "application/json",
                                        "charset": "utf8",
                                        "transferEncoding": "url",
                                    });
                                    _request(message);
                                } else {
                                    _chunkCache[id][parseInt(meta?.chunk)] = data;
                                }
                                if (parseInt(meta?.chunks) == -1 || (Object.keys(_chunkCache[id]).length - 2) !== parseInt(meta?.chunks)) { return; }
                                let msgData = [];
                                for (let chunkInd = 1; chunkInd <= parseInt(meta?.chunks); chunkInd++) {
                                    msgData.push(_chunkCache[id][chunkInd]);
                                }
                                data = msgData.join('');
                                try {
                                    data = JSON.parse(data);
                                } catch (e) {};
                                delete data.files[0].hash;
                                message.method.data = _cloneInto(data);
                                if (data.files[0].content) {
                                    delete meta.chunk;
                                    delete meta.chunks;
                                    delete message.meta.chunk;
                                    delete message.meta.chunks;
                                    delete _chunkCache[id];
                                } else {
                                    _cache[id] = route;
                                    let chunkInd = 1;
                                    const chunkCount = _chunkCache[id]["fileData"].length + 2;
                                    if (!message.method.data.files[0].path) {
                                        message.method.data.files[0].contentEncoding = 'url';
                                    }
                                    message.method.data.files[0].content = '';
                                    message.method.data.files[0].id = _chunkCache[id]["fileId"];
                                    message.method.data = JSON.stringify(message.method.data);
                                    message.meta.data = _cloneInto({
                                        "chunk": (chunkCount - 1).toString(),
                                        "chunks": "-1",
                                    });
                                    _request(message);
                                    message.method.data = "";
                                    message.meta.data = _cloneInto({
                                        "chunk": chunkCount.toString(),
                                        "chunks": chunkCount.toString(),
                                    });
                                    _request(message);
                                    delete _chunkCache[id];
                                    return;
                                }
                             }

                             _cache[id] = route;

                             if (message.mode == "debug") console.info(_ID + " get from web page message: " + JSON.stringify(message));
                             else                         console.info(_ID + " get from web page message id: " + id);

                            if ("registered" == type) {
                                message.method.result = JSON.stringify(bootstrap.registered(message?.method?.data));
                                _response(message);

                             }
                             else if (["loadScripts", "loadAllScripts"].includes(type)) {
                                bootstrap.loadScripts(message?.method?.data)
                                    .then(result => {
                                        message.method.result = JSON.stringify(result);
                                        _response(message);
                                    })
                                    .catch(error => {
                                        console.error(_ID + ": failed to load scripts:", error);
                                        message.method.error = error.message || String(error);
                                        _response(message);
                                    });
                             }
                             else if ("cancelChunks" == type) {
                                _cancelChunks = true;
                                console.info(_ID + " cancel chunks  message id: " + id);
                                message.method.result = _cancelChunks ? "true" : "false";
                                _response(message);

                             }
                             else if ("chunkSize" == type) {
                                   if (!!data) _chunkSize = +data;
                                   message.method.result = _chunkSize +"";
                                   _response(message);
                             }
                             else if ( typeof data === 'string' || data instanceof String ) {
                                _request(message);
                             }
                             else {
                                _handleCertificate(data).then((data) => {
                                   _handleRequest(message, data);
                                }).catch((error) => {
                                    _handleError(message, error);
                                });
                             }
                         }
                     }
                 });

               chrome.runtime.onMessage.addListener(
                    function (message, sender, sendResponse) {
                         if (!sender.tab) {
                             let id = message.id;

                              if (message.mode == "debug") console.info(_ID + " get from background message: " + JSON.stringify(message));
                              else                         console.info(_ID + " get from background message id: " + message.id);

                             _response(message);
                         }
                         sendResponse(null);
                    });
              }
          });
     };

    _init();
})();