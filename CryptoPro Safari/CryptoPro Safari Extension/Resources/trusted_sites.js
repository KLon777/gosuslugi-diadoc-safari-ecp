function async_spawn(generatorFunc) {
  function continuer(verb, arg) {
    var result;
    try {
          result = generator[verb](arg);
    } catch (err) {
          return Promise.reject(err);
    }
    if (result.done) {
          return result.value;
    } else {
          return Promise.resolve(result.value).then(onFulfilled, onRejected);
    }
  }
  var generator = generatorFunc(Array.prototype.slice.call(arguments, 1));
  var onFulfilled = continuer.bind(continuer, "next");
  var onRejected = continuer.bind(continuer, "throw");
  return onFulfilled();
}

var g_oCfg, g_oSites;

var cadesplugin = {};
cadesplugin.LOG_LEVEL_DEBUG = 4;
cadesplugin.LOG_LEVEL_INFO = 2;
cadesplugin.LOG_LEVEL_ERROR = 1;

function decimalToHexString(number) {
    if (number < 0) {
        number = 0xFFFFFFFF + number + 1;
    }

    return number.toString(16).toUpperCase();
}

function GetErrorMessage(e) {
    var err = e.message;
    if (!err) {
        err = e;
    } else if (e.number) {
        err += " (0x" + decimalToHexString(e.number) + ")";
    }
    return err;
}

function CreateObjectAsync(name) {
    async_spawn(function *(arg) {
        try {
            var PluginObject = yield cpcsp_chrome_nmcades.CreatePluginObject();
            var namedObject = yield PluginObject.CreateObjectAsync(arg[0]);
            return namedObject;
        }
        catch (err) {
            // try/catch just works, rejected promises are thrown here
            alert("Exception: " + err.message);
        }
    }, name); //async_spawn
}

function deleteAlertNode(event) {
    event = event || window.event;
    var target = event.target || event.srcElement;
    var alertToRemove = target.parentNode;
    alertToRemove.parentNode.removeChild(alertToRemove);
}

function deleteSiteByName(siteName) {
    async_spawn(function *(arg) {
        try {
            var sitesCnt = yield g_oSites.Count;
            for (var i = 0; i < sitesCnt; i++) {
                var curr_siteName = yield g_oSites.Item(i);
                if (arg[0] == curr_siteName) {
                    yield g_oSites.Remove(i);
                    return;
                }
            }
        }
        catch (e) {
            addErrorMessage("Не удалось удалить доверенный узел.", siteName, GetErrorMessage(e));
        }
    }, siteName); //async_spawn
}

function deleteSiteNode(event) {
    // Удаляем старое сообщение, если было
    removeMessage("errmsg");
    removeMessage("successmsg");
    removeMessage("example");

    event = event || window.event;
    var target = event.target || event.srcElement;
    var siteName;
    try {
        var liToRemove = target.parentNode;
        siteName = liToRemove.getElementsByTagName('input')[0].getAttribute('value');
        deleteSiteByName(siteName);
        liToRemove.parentNode.removeChild(liToRemove);
    }
    catch (e) {
        addErrorMessage("Не удалось удалить доверенный узел.", siteName, GetErrorMessage(e));
    }
}

/// сохранить настройки
function saveNodes() {
    async_spawn(function *() {
        try {
            yield g_oSites.Save();
            addSuccessMessage("Список доверенных узлов успешно сохранен.");
        }
        catch (e) {
            addErrorMessage("Не удалось сохранить настройки.", GetErrorMessage(e));
        }
    }); //async_spawn
}

function loadNodes() {
    try {
        async_spawn(function *() {
            try {
                var PluginObject = yield cpcsp_chrome_nmcades.CreatePluginObject();
                g_oCfg = yield PluginObject.CreateObjectAsync("CAdESCOM.PluginConfiguration");
            }
            catch (err) {
                // try/catch just works, rejected promises are thrown here
                alert("Exception: " + err.message);
            }
            
            isDisabledSites = yield g_oCfg.IsUntrustedSitesDisabled;
            if (isDisabledSites == true) {
                var tmpElem = document.getElementById("new_node_name");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("add_button");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("sitesLine1");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("btn_save");
                tmpElem.parentNode.removeChild(tmpElem);
                
                var newLi = document.createElement('div');
                newLi.textContent = "Групповая политика блокирует список доверенных узлов. Обратитесь к системному администратору.";
                
                document.getElementById("untrustedSitesDisabledMsg").appendChild(newLi);
                document.getElementById("untrustedSitesDisabledMsg").style.display = "block";
            } else {
                /// Получить список доверенных сайтов
                g_oSites = yield g_oCfg.TrustedSites;
                var sitesCnt = yield g_oSites.Count;

                for (var i = 0; i < sitesCnt; i++) {
                    var siteName = "";
                    try {
                        siteName = yield g_oSites.Item(i);
                        addNewLiByName(siteName);
                    }
                    catch (e) {
                        addErrorMessage("Не удалось загрузить доверенный узел.", siteName, GetErrorMessage(e));
                    }
                }
            }
            
            sitesGP = yield g_oCfg.TrustedSitesGroupPolicy;
            if (sitesGP.length > 0) {
                sitesGP = sitesGP.replace(/;/g, ", ");
                addGroupPolicySites(sitesGP);
            } else {
                var tmpElem = document.getElementById("nodes_listGP");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("groupPolicySitesLabel");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("groupPolicySitesLine1");
                tmpElem.parentNode.removeChild(tmpElem);
                tmpElem = document.getElementById("groupPolicySitesLine2");
                tmpElem.parentNode.removeChild(tmpElem);
            }
            
        }); //async_spawn
    }
    catch (e) {
        addErrorMessage("Не удалось загрузить список доверенных узлов.", GetErrorMessage(e));
    }
}

function removeMessage(messageId) {
    var messageNode = document.getElementById(messageId);
    if (messageNode && messageNode.parentNode) {
        messageNode.parentNode.removeChild(messageNode);
    }
}

function addErrorMessage(usrMessage, siteName, errMessage) {
    try {
        // Удаляем старое сообщение, если было
        removeMessage("errmsg");
        removeMessage("successmsg");
        removeMessage("example");

        var message = usrMessage;
        if ("" != siteName) {
            message += " Имя узла: " + siteName + ".";
        }
        message += " Сообщение об ошибке: " + errMessage + ".";

        var newXButton = document.createElement('button');
        newXButton.textContent = "×";
        newXButton.setAttribute("type", "button");
        newXButton.setAttribute("class", "close");
        newXButton.onclick = deleteAlertNode;

        var messageDiv = document.createElement('div');
        messageDiv.setAttribute("class", "alert");
        messageDiv.setAttribute("id", "errmsg");
        messageDiv.appendChild(newXButton);
        messageDiv.appendChild(document.createTextNode(message));

        var pageHeader = document.getElementById("centralBlockHeader");
        pageHeader.parentNode.insertBefore(messageDiv, pageHeader.nextSibling);
    }
    catch (e) {
        // alert(GetErrorMessage(e));
    }
}

function addSuccessMessage(message) {
    try {
        // Удаляем старое сообщение, если было
        removeMessage("errmsg");
        removeMessage("successmsg");
        removeMessage("example");

        var newXButton = document.createElement('button');
        newXButton.textContent = "×";
        newXButton.setAttribute("type", "button");
        newXButton.setAttribute("class", "close");
        newXButton.onclick = deleteAlertNode;

        var messageDiv = document.createElement('div');
        messageDiv.setAttribute("class", "success");
        messageDiv.setAttribute("id", "successmsg");
        messageDiv.appendChild(newXButton);
        messageDiv.appendChild(document.createTextNode(message));

        var pageHeader = document.getElementById("centralBlockHeader");
        pageHeader.parentNode.insertBefore(messageDiv, pageHeader.nextSibling);
    }
    catch (e) {
        // alert(GetErrorMessage(e));
    }
}

function addNewNode() {
    try {
        // Удаляем старое сообщение, если было
        removeMessage("errmsg");
        removeMessage("successmsg");
        removeMessage("example");

        var newSiteNameElem = document.getElementById("new_node_name");
        if (!newSiteNameElem || "" == newSiteNameElem.value) {
            return;
        }
        var newSiteName = newSiteNameElem.value;
        newSiteNameElem.value = "";

        async_spawn(function *() {
            try {
                yield g_oSites.Add(newSiteName);
                addNewLiByName(newSiteName);
            }
            catch (e) {
                addErrorMessage("Не удалось добавить доверенный узел.", newSiteName, GetErrorMessage(e));
                addExample();
                return;
            }
        }); //async_spawn
    }
    catch (e) {
        addErrorMessage("Ошибка при добавлении доверенного узла.", GetErrorMessage(e));
    }
}

function addExample() {
    try {
        if (document.getElementById('example') != null)
            centralBlock.removeChild(example);

        var newXButton = document.createElement('button');
        newXButton.textContent = "×";
        newXButton.setAttribute("type", "button");
        newXButton.setAttribute("class", "close");
        newXButton.onclick = deleteAlertNode;

        var exampleDiv = document.createElement('div');
        exampleDiv.setAttribute("class", "alert");
        exampleDiv.setAttribute("id", "example");
        exampleDiv.innerHTML = "<div>Введена неправильная последовательность подстановочных знаков, некорректный адрес, или добавляемый адрес уже существует.<br>\
                Примеры правильных последовательностей:<br>\
                https://*.cadescompany.ru<br>\
                http://*.cpdn.cadescompany.ru<br>\
                ftp://157.54.23.41/<br>\
                Примеры неправильных последовательностей:<br>\
                http://www.*.com<br>\
                ftp://*<br>\
                https://*.ru</div>";
        exampleDiv.insertBefore(newXButton, exampleDiv.childNodes[0]);

        var pageHeader = document.getElementById("centralBlockHeader");
        pageHeader.parentNode.insertBefore(exampleDiv, pageHeader.nextSibling);
    }
    catch(e) {
        addErrorMessage("Введена неправильная последовательность подстановочных знаков, некорректный адрес, или добавляемый адрес уже существует.", GetErrorMessage(e));
    }
}

function addNewLiByName(newSiteName) {
    try {
        var newLiInput = document.createElement('input');
        newLiInput.setAttribute("type", "hidden");
        newLiInput.setAttribute("value", newSiteName);

        var newLiButton = document.createElement('button');
        newLiButton.textContent = "×";
        newLiButton.setAttribute("class", "close pull-left");
        newLiButton.onclick = deleteSiteNode;

        var newLi = document.createElement('li');
        newLi.textContent = newSiteName;
        newLi.appendChild(newLiInput);
        newLi.appendChild(newLiButton);

        document.getElementById("nodes_list").appendChild(newLi);
    }
    catch (e) {
        addErrorMessage("Не удалось добавить доверенный узел.", newSiteName, GetErrorMessage(e));
    }
}
function addGroupPolicySites(newSites) {
    try {
        var newLiInput = document.createElement('input');
        newLiInput.setAttribute("type", "hidden");
        newLiInput.setAttribute("value", newSites);

        var newLi = document.createElement('li');
        newLi.textContent = newSites;
        newLi.appendChild(newLiInput);

        document.getElementById("nodes_listGP").appendChild(newLi);
    }
    catch (e) {
        addErrorMessage("Не удалось добавить доверенные узлы групповой политики на страницу. ", newSites, GetErrorMessage(e));
    }
}

var bNodesLoaded = false;
window.addEventListener("message", function (event) {
    if (typeof (event.data) === 'string' && event.data.match("cadesplugin_loaded") && !bNodesLoaded) {
        bNodesLoaded = true;
        loadNodes();
    }
}, false);

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('add_button').addEventListener('click', addNewNode);
    document.getElementById('btn_save').addEventListener('click', saveNodes);
    document.getElementById('btn_trust_note').addEventListener('click', deleteAlertNode);
});
