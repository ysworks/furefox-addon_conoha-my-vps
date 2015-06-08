
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

    var xhr = require("sdk/net/xhr").XMLHttpRequest();
    xhr.onload = function () {
        if (this.status == 200) {
            token[region] = JSON.parse(this.responseText).access.token;
            onSuccess();
        } else if (this.status == 401) {
            showAuthError();
        } else {
            console.log(this.responseText);
            showAuthError();
        }
    };
    xhr.onerror = function () {
        showAuthError();
    };
    xhr.open("POST", "https://identity." + region + ".conoha.io/v2.0/tokens");
    xhr.setRequestHeader("Accept", "application/json");
    var tenantId = "gnct" + apiUserName.substring(4);
    xhr.send(JSON.stringify({ auth: { passwordCredentials: { username: apiUserName, password: apiPassword }, tenantName: tenantId } }));
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

                var _GetServers = function(_region){
                    if (require("sdk/simple-prefs").prefs[_region]) {
                        if(token[_region]){
                            GetServers(_region, 0);
                        }else{
                            GetToken(_region, function(){
                                GetServers(_region, 0);
                            });
                        }
                    }
                }

                _GetServers("tyo1");
                _GetServers("sin1");
                _GetServers("sjc1");

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

    var xhr = require("sdk/net/xhr").XMLHttpRequest();
    xhr.onload = function () {
        if (this.status == 200) {
            // 詳細表示
            panel.port.emit("vmList", { detail: this.responseText, region: region });
        } else if (this.status == 401) {
            GetToken(region, function(){
                GetServers(region, ++retry);
            });
        } else {
            console.log(this.responseText);
            showAuthError();
        }
    }
    xhr.onerror = function () {
        console.log(this.responseText);
        showAuthError();
    }
    xhr.open("GET", "https://compute." + region + ".conoha.io/v2/" + token[region].tenant.id + "/servers/detail");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Auth-Token", token[region].id);
    xhr.send();
}


// コンソールURL取得
function GetConsoleUrl(region, uuid, type, retry) {

    if (retry > 2) {
        return;
    }

    var xhr = require("sdk/net/xhr").XMLHttpRequest();
    xhr.onload = function () {
        if (this.status == 200) {
            panel.port.emit("setConsoleUrl", { uuid: uuid, url: JSON.parse(this.responseText).console.url, type: type });
        } else if (this.status == 401) {
            GetToken(region, function(){
                GetConsoleUrl(region, uuid, type, ++retry);
            });
        } else {
            console.log(this.status);
            return;
        }
    }
    xhr.onerror = function () {
        console.log(this.responseText);
        return;
    }
    xhr.open("POST", "https://compute." + region + ".conoha.io/v2/" + token[region].tenant.id + "/servers/" + uuid + '/action');
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Auth-Token", token[region].id);

    if (type == 'vnc') {
        xhr.send('{"os-getVNCConsole": {"type": "novnc"}}');
    } else {
        xhr.send('{"os-getWebConsole": {"type": "serial"}}');
    }

}

