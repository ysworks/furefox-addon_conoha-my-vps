const regions = ["tyo1","sin1","sjc1"];

var apiUserName;
var apiPassword;

var token = {};

// ボタン
var { ToggleButton } = require("sdk/ui/button/toggle");
var button = ToggleButton({
    id: "conoha-link",
    label: "ConoHa VPS",
    icon: {
        "16": "./image/icon-16.png",
        "32": "./image/icon-32.png",
        "64": "./image/icon-64.png"
    },
    onChange: function (state) {
        if (state.checked) {
            panel.show();
            if(apiUserName && apiPassword){
                GetAllServers();
            } else {
                panel.port.emit("showAuthError", null);
            }
        }
    }
});


// パネル
var panel = require("sdk/panel").Panel({
    contentURL: "./panel.html",
    width: 320,
    height: 123,
    position: button,
    onShow: function () {
        if (require("sdk/simple-prefs").prefs.conohamode) {
            panel.port.emit("setConohaMode", { mode: "conoha-mode"});
        }else{
            panel.port.emit("setConohaMode", null);
        }
    },
    onHide: function () {
       button.state('window', { checked: false });
    },
    onMessage: function (message) {
        switch (message.type) {
            case 'resize':
                panel.height = message.value < 500 ? message.value : 500;
                break;
            case 'getConsoleUrl':
                GetConsoleUrl(message.value.region, message.value.uuid, message.value.type);
                break;
            case 'retry':
                    require("sdk/passwords").remove({
                        realm: "ConoHa API",
                        username: apiUserName,
                        password: apiPassword,
                        url: require("sdk/self").uri,
                        onComplete: function () {
                            StorePassword(message.value.apiUserName, message.value.apiPassword);
                        },
                        onError: function () {
                            StorePassword(message.value.apiUserName, message.value.apiPassword);
                        }
                    });
                break;
        }

    }
});

// パスワード保存
function StorePassword(username, password) {
    require("sdk/passwords").store({
        realm: "ConoHa API",
        url: require("sdk/self").uri,
        username: username,
        password: password,
        onComplete: function () {
            GetAllServers();
        }
    });
}


// 認証エラー画面表示
function showAuthError() {
    panel.port.emit("showAuthError", { apiUserName: apiUserName, apiPassword: apiPassword });
}


// アクセストークン取得
function GetToken(region, onSuccess) {
    token[region] = undefined;

    if (!apiUserName || !apiPassword || apiUserName.length < 5) {
        showAuthError();
        return;
    }

    var tenantId = "gnct" + apiUserName.substring(4);
    require("sdk/request").Request({
        url: "https://identity." + region + ".conoha.io/v2.0/tokens",
        headers: {"Accept": "application/json"},
        content: JSON.stringify({ auth: { passwordCredentials: { username: apiUserName, password: apiPassword }, tenantName: tenantId } }),
        onComplete: function (response) {
            if (response.status == 200) {
                token[region] = response.json.access.token;
                onSuccess();
            } else if (response.status == 401) {
                showAuthError();
            } else {
                console.log(response.text);
                showAuthError();
            }
        }
    }).post();
}


// サーバー一覧取得
function GetAllServers() {
    panel.port.emit("showLoading", "");

    require("sdk/passwords").search({
        realm: "ConoHa API",
        url: require("sdk/self").uri,
        onComplete: function(credentials) {

            if (credentials.length) {
                apiUserName = credentials[0].username;
                apiPassword = credentials[0].password;
                
                regions.forEach(function(region){
                    if (require("sdk/simple-prefs").prefs[region]) {
                        if(token[region]){
                            GetServers(region, 0);
                        }else{
                            GetToken(region, function(){
                                GetServers(region, 0);
                            });
                        }
                    }
                });

            } else {
                showAuthError();
            }

        },
        onError: function () {
            showAuthError();
        }
    });
}


// サーバー詳細取得
function GetServers(region, retry) {

    if (retry > 2) {
        return;
    }

    require("sdk/request").Request({
        url: "https://compute." + region + ".conoha.io/v2/" + token[region].tenant.id + "/servers/detail",
        headers: {"Accept": "application/json", "X-Auth-Token": token[region].id},
        onComplete: function (response) {
            if (response.status == 200) {
                // 詳細表示
                panel.port.emit("vmList", { detail: response.text, region: region });
            } else if (response.status == 401) {
                GetToken(region, function(){
                    GetServers(region, ++retry);
                });
            } else {
                console.log(response.text);
                showAuthError();
            }
        }
    }).get();
}


// コンソールURL取得
function GetConsoleUrl(region, uuid, type, retry) {

    if (retry > 2) {
        return;
    }

    require("sdk/request").Request({
        url: "https://compute." + region + ".conoha.io/v2/" + token[region].tenant.id + "/servers/" + uuid + "/action",
        headers: {"Accept": "application/json", "X-Auth-Token": token[region].id},
        content: type == 'vnc' ? '{"os-getVNCConsole": {"type": "novnc"}}' : '{"os-getWebConsole": {"type": "serial"}}', 
        onComplete: function (response) {
            if (response.status == 200) {
                panel.port.emit("setConsoleUrl", { uuid: uuid, url: response.json.console.url, type: type });
            } else if (response.status == 401) {
                GetToken(region, function(){
                    GetConsoleUrl(region, uuid, type, ++retry);
                });
            } else {
                console.log(response.text);
                return;
            }
        }
    }).post();
}

