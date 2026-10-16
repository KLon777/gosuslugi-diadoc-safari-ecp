var button_check_available = document.getElementById("button_check_available");
var button_trusted_sites = document.getElementById("button_trusted_sites");
var button_webtools = document.getElementById("button_webtools");
var button_instruction = document.getElementById("button_instruction");
var button_site = document.getElementById("button_site");
var button_forum = document.getElementById("button_forum");
var button_support = document.getElementById("button_support");
var button_logo = document.getElementById("logo");

if (button_check_available)
    button_check_available.addEventListener("click", open_testpage);
if (button_trusted_sites)
    button_trusted_sites.addEventListener("click", open_trusted_sites);
if (button_webtools)
    button_webtools.addEventListener("click", open_webtools);
if (button_instruction)
    button_instruction.addEventListener("click", open_instruction);
if (button_site)
    button_site.addEventListener("click", open_site);
if (button_forum)
    button_forum.addEventListener("click", open_forum);
if (button_support)
    button_support.addEventListener("click", open_support);
if (button_logo)
    button_logo.addEventListener("click", open_homepage);

function onCreated(tab) {
    console.log("Created new tab: " + tab.id);
}
function onError(error) {
    console.log("Error: " + error);
}

function open_url(url) {
    if (navigator.userAgent.indexOf("Firefox") !== -1) {
        var creating = browser.tabs.create({
            url: url
        });
        creating.then(onCreated, onError);
    }
    else
        window.open(url);
}

function exists_trusted_sites_html() {
    var http = new XMLHttpRequest();
    try {
        http.open('HEAD', "trusted_sites.html");
        http.onload = function (e) {
            if (http.readyState === 4)
                return http.status === 200;
        };
    }
    catch (ex) {
        return false;
    }
}

function open_homepage() {
    open_url("https://cadescompany.ru/cadesplugin");
}
function open_testpage(){
    open_url("https://cadescompany.ru/sites/default/files/products/cades/demopage/cades_bes_sample.html");
}
function open_trusted_sites()
{
    if (exists_trusted_sites_html())
        open_url("trusted_sites.html");
    else
        open_url("../trusted_sites.html");
}
function open_webtools(){
    open_url("https://cadescompany.ru/sites/default/files/products/cades/demopage/webtools.html");
}
function get_os()
{
    if (navigator.appVersion.indexOf("Win") !== -1)
        return "Windows";
    if (navigator.appVersion.indexOf("Mac") !== -1)
        return "MacOS";
    if (navigator.appVersion.indexOf("X11") !== -1)
        return "UNIX";
}
function open_instruction(){
    var os = get_os();
    if ("Windows" === os)
        open_url('https://cadescompany.ru/plugin-installation-windows');
    if ("UNIX" === os)
        open_url('https://cadescompany.ru/plugin-installation-unix');
    if ("MacOS" === os)
        open_url('https://cadescompany.ru/plugin-installation-macos');
}
function open_site(){
    open_url("https://www.cadescompany.ru/");
}
function open_forum(){
    open_url("https://www.cadescompany.ru/forum2/");
}
function open_support(){
    open_url('https://cadescompany.ru/support');
}

