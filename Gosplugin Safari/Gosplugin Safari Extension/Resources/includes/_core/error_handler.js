console.debug("%cgosuslugi.plugin.extension.error_handler load", "font-weight: bold;");


(function (global) {
    const _ID = "gosuslugi.plugin.extension.error_handler";


    const _BASE_PROTOCOL = 10000;

    const _CODES = Object.freeze({
         HTTP_CONTINUE: 100,
         HTTP_SWITCHING_PROTOCOLS: 101,
         HTTP_PROCESSING: 102,
         HTTP_EARLY_HINTS: 103,
         HTTP_OK: 200,
         HTTP_CREATED: 201,
         HTTP_ACCEPTED: 202,
         HTTP_NON_AUTHORITATIVE_INFORMATION: 203,
         HTTP_NO_CONTENT: 204,
         HTTP_RESET_CONTENT: 205,
         HTTP_PARTIAL_CONTENT: 206,

         HTTP_MULTI_STATUS: 207,
         HTTP_ALREADY_REPORTED: 208,
         HTTP_IM_USED: 226,
         HTTP_MULTIPLE_CHOICES: 300,
         HTTP_MOVED_PERMANENTLY: 301,
         HTTP_FOUND: 302,
         HTTP_SEE_OTHER: 303,
         HTTP_NOT_MODIFIED: 304,
         HTTP_USE_PROXY: 305,
         HTTP_RESERVED: 306, 
         HTTP_TEMPORARY_REDIRECT: 307,
         HTTP_PERMANENT_REDIRECT: 308,
         HTTP_BAD_REQUEST: 400,
         HTTP_UNAUTHORIZED: 401,
         HTTP_PAYMENT_REQUIRED: 402,
         HTTP_FORBIDDEN: 403,
         HTTP_NOT_FOUND: 404,
         HTTP_METHOD_NOT_ALLOWED: 405,
         HTTP_NOT_ACCEPTABLE: 406,
         HTTP_PROXY_AUTHENTICATION_REQUIRED: 407,
         HTTP_REQUEST_TIMEOUT: 408,
         HTTP_CONFLICT: 409,
         HTTP_GONE: 410,
         HTTP_LENGTH_REQUIRED: 411,
         HTTP_PRECONDITION_FAILED: 412,
         HTTP_PAYLOAD_TOO_LARGE: 413,
         HTTP_URI_TOO_LONG: 414,
         HTTP_UNSUPPORTED_MEDIA_TYPE: 415,
         HTTP_RANGE_NOT_SATISFIABLE: 416,
         HTTP_EXPECTATION_FAILED: 417,
         HTTP_IM_A_TEAPOT: 418,
         HTTP_AUTHENTICATION_TIMEOUT: 419,
         HTTP_MISDIRECTED_REQUEST: 421,
         HTTP_UNPROCESSABLE_ENTITY: 422,
         HTTP_LOCKED: 423,
         HTTP_FAILED_DEPENDENCY: 424,
         HTTP_TOO_EARLY: 425,
         HTTP_UPGRADE_REQUIRED: 426,
         HTTP_PRECONDITION_REQUIRED: 428,
         HTTP_TOO_MANY_REQUESTS: 429,
         HTTP_REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
         HTTP_RETRY_WITH: 449,
         HTTP_UNAVAILABLE_FOR_LEGAL_REASONS: 451,
         HTTP_CLIENT_CLOSED_REQUEST: 499,
         HTTP_INTERNAL_SERVER_ERROR: 500,
         HTTP_NOT_IMPLEMENTED: 501,
         HTTP_BAD_GATEWAY: 502,
         HTTP_SERVICE_UNAVAILABLE: 503,
         HTTP_GATEWAY_TIMEOUT: 504,
         HTTP_HTTP_VERSION_NOT_SUPPORTED: 505,
         HTTP_VARIANT_ALSO_NEGOTIATES: 506,
         HTTP_INSUFFICIENT_STORAGE: 507,
         HTTP_LOOP_DETECTED: 508,
         HTTP_BANDWIDTH_LIMIT_EXCEEDED: 509,
         HTTP_NOT_EXTENDED: 510,
         HTTP_NETWORK_AUTHENTICATION_REQUIRED: 511,
         HTTP_UNKNOWN_ERROR: 520,
         HTTP_WEB_SERVER_IS_DOWN: 521,
         HTTP_CONNECTION_TIMED_OUT: 522,
         HTTP_ORIGIN_IS_UNREACHABLE: 523,
         HTTP_TIMEOUT_OCCURRED: 524,
         HTTP_SSL_HANDSHAKE_FAILED: 525,
         HTTP_INVALID_SSL_CERTIFICATE: 526,

         PROTOCOL_CONNECTION_LOST: _BASE_PROTOCOL + 1,
         PROTOCOL_CONNECTION_CLOSED: _BASE_PROTOCOL + 2,
         PROTOCOL_HOST_NOT_FOUND: _BASE_PROTOCOL + 3,

         PROTOCOL_NATIVE_HOST_LOST: _BASE_PROTOCOL + 4,
         PROTOCOL_NATIVE_HOST_NOT_FOUND: _BASE_PROTOCOL + 5,

         PROTOCOL_WEB_SOCKET_NOT_FOUND: _BASE_PROTOCOL + 6,
    });

    const _MESSAGES = Object.freeze({
        [_CODES.HTTP_CONTINUE]: "Continue («продолжайте»)",
        [_CODES.HTTP_SWITCHING_PROTOCOLS]: "Switching Protocols («переключение протоколов»)",
        [_CODES.HTTP_PROCESSING]: "Processing («идёт обработка»)",
        [_CODES.HTTP_EARLY_HINTS]: "Early Hints («ранняя метаинформация»)",
        [_CODES.HTTP_OK]: "OK («хорошо»)",
        [_CODES.HTTP_CREATED]: "Created («создано»)",
        [_CODES.HTTP_ACCEPTED]: "Accepted («принято»)",
        [_CODES.HTTP_NON_AUTHORITATIVE_INFORMATION]: "Non-Authoritative Information («информация не авторитетна»)",
        [_CODES.HTTP_NO_CONTENT]: "No Content («нет содержимого»)",
        [_CODES.HTTP_RESET_CONTENT]: "Reset Content («сбросить содержимое»)",
        [_CODES.HTTP_PARTIAL_CONTENT]: "Partial Content («частичное содержимое»)",
        [_CODES.HTTP_MULTI_STATUS]: "Multi-Status («многостатусный»)",
        [_CODES.HTTP_ALREADY_REPORTED]: "Already Reported («уже сообщалось»)",
        [_CODES.HTTP_IM_USED]: "IM Used («использовано IM»)",
        [_CODES.HTTP_MULTIPLE_CHOICES]: "Multiple Choices («множество выборов»)",
        [_CODES.HTTP_MOVED_PERMANENTLY]: "Moved Permanently («перемещено навсегда»)",
        [_CODES.HTTP_FOUND]: "Found («найдено»)",
        [_CODES.HTTP_SEE_OTHER]: "See Other («смотреть другое»)",
        [_CODES.HTTP_NOT_MODIFIED]: "Not Modified («не изменялось»)",
        [_CODES.HTTP_USE_PROXY]: "Use Proxy («использовать прокси»)",
        [_CODES.HTTP_RESERVED]: "Reserved (зарезервировано)",
        [_CODES.HTTP_TEMPORARY_REDIRECT]: "Temporary Redirect («временное перенаправление»)",
        [_CODES.HTTP_PERMANENT_REDIRECT]: "Permanent Redirect («постоянное перенаправление»)",
        [_CODES.HTTP_BAD_REQUEST]: "Bad Request («неправильный запрос»)",
        [_CODES.HTTP_UNAUTHORIZED]: "Unauthorized («не авторизован»)",
        [_CODES.HTTP_PAYMENT_REQUIRED]: "Payment Required («необходима оплата»)",
        [_CODES.HTTP_FORBIDDEN]: "Forbidden («запрещено»)",
        [_CODES.HTTP_NOT_FOUND]: "Not Found («не найдено»)",
        [_CODES.HTTP_METHOD_NOT_ALLOWED]: "Method Not Allowed («метод не поддерживается»)",
        [_CODES.HTTP_NOT_ACCEPTABLE]: "Not Acceptable («неприемлемо»)",
        [_CODES.HTTP_PROXY_AUTHENTICATION_REQUIRED]: "Proxy Authentication Required («необходима аутентификация прокси»)",
        [_CODES.HTTP_REQUEST_TIMEOUT]: "Request Timeout («истекло время ожидания»)",
        [_CODES.HTTP_CONFLICT]: "Conflict («конфликт»)",
        [_CODES.HTTP_GONE]: "Gone («удалён»)",
        [_CODES.HTTP_LENGTH_REQUIRED]: "Length Required («необходима длина»)",
        [_CODES.HTTP_PRECONDITION_FAILED]: "Precondition Failed («условие не выполнено»)",
        [_CODES.HTTP_PAYLOAD_TOO_LARGE]: "Payload Too Large («полезная нагрузка слишком велика»)",
        [_CODES.HTTP_URI_TOO_LONG]: "URI Too Long («URI слишком длинный»)",
        [_CODES.HTTP_UNSUPPORTED_MEDIA_TYPE]: "Unsupported Media Type («неподдерживаемый тип данных»)",
        [_CODES.HTTP_RANGE_NOT_SATISFIABLE]: "Range Not Satisfiable («диапазон недоступен»)",
        [_CODES.HTTP_EXPECTATION_FAILED]: "Expectation Failed («ожидание не оправдалось»)",
        [_CODES.HTTP_IM_A_TEAPOT]: "I'm a teapot («я — чайник»)",
        [_CODES.PROTOCOL_CONNECTION_LOST]: "Protocol Connection Lost («соединение потеряно»)",
        [_CODES.PROTOCOL_CONNECTION_CLOSED]: "Protocol Connection Closed («соединение закрыто»)",
        [_CODES.PROTOCOL_HOST_NOT_FOUND]: "Нет соединения с приложением",
        [_CODES.PROTOCOL_NATIVE_HOST_LOST]: "Потеряно соединение с плагином",
        [_CODES.PROTOCOL_NATIVE_HOST_NOT_FOUND]: "Нет соединения с приложением",
        [_CODES.PROTOCOL_WEB_SOCKET_NOT_FOUND]: "Не запущено приложение",
    });

    const _ERRORS = Object.fromEntries(
         Object.entries(_CODES).map(([codeName, code]) => [
              codeName,
              {
                   category: "Network",
                   code,
                   codeName,
                   message: _MESSAGES[code] || "Unknown network error",
              },
         ])
     );

    async function loadErrorData() {
         const filename = "error_data.json";
         const response = await fetch(chrome.runtime.getURL('includes/_core/' + filename))
         if (!response.ok) {
              throw new Error(_ID + ": failed to get errors: " + response.status);
         }

         const json = await response.json();
         for (const { category, codeName, message, code } of json) {
              if (codeName) {
                   const error = { category, codeName, message, code };
                   _ERRORS[codeName] = error;
              }
         }
         console.log(_ID + ":  load " + filename + " completed");
    }

    function text_to_code(text) {
         switch (text) {
              case "Native host has exited.":
              case "Error when communicating with the native messaging host.": return _ERRORS.PROTOCOL_NATIVE_HOST_LOST.code;
              case "Specified native messaging host not found.":               return _ERRORS.PROTOCOL_NATIVE_HOST_NOT_FOUND.code;
              default:                                                         return _ERRORS.PROTOCOL_CONNECTION_CLOSED.code;
         }
    };

    function throw_error(code, what) {
         throw new Error(JSON.stringify({ code: code, message: what }));
    };

    function error_info_by_code(code) {
         for (const error of Object.values(_ERRORS)) {
              if (error.code == code) {
                   return error;
              }
         }
         return null;
    };

    function set_message_error(message, code, what) {
         if (!message.method) message.method = { data: "", result: ""  };
         if (!message.meta?.data) message.meta = { ...message.meta, data: { chunk: "", chunks: "" } };

         message.method.result = "";
         message.method.data = "";
         message.meta.data.chunk = "";
         message.meta.data.chunks = "";

         message.code = (code || _ERRORS.Generic.code) + "";

         const errorInfo = error_info_by_code(message.code);
         const categoryError = errorInfo.category || "";

         message.error = what || errorInfo.message || `unknown code: ${message.code}`;
         message.errorMessage = `${message.code} ${categoryError} '${message.error}'`;
    };

    function parse_message_error(message, error) {
         let code = null;
         let what = null;

         try {
              const parsed = JSON.parse(error.message);
              if( parsed.code    ) code = parsed.code;
              if( parsed.message ) what = parsed.message;
         } catch (e) {}

         set_message_error(message, code, what);
    };

    //экспортируем объект сразу, чтобы был доступен базовый набор ошибок
    const error_handler = {
         ERRORS: _ERRORS,
         throw_error,
         text_to_code,
         set_message_error,
         parse_message_error
    };

    if (typeof module !== "undefined" && module.exports) {
         module.exports = error_handler;
    } else if (typeof define === "function" && define.amd) {
         define(() => error_handler);
    } else if (typeof globalThis !== "undefined" && typeof globalThis.window === "undefined") {
         try {
              Object.defineProperty(global, '__esModule', { value: true });
              global.error_handler = error_handler;
         } catch (e) {
              console.log('error_handler: error in es modules');
         }
    } else {
         global.error_handler = error_handler;
    }

    loadErrorData()
         .catch(error => {
              console.error(_ID + ": failed to load error data");
         })
         .finally(() => {
              console.log(_ID + ": error_handler ready");
         });
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);