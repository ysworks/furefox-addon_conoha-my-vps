// このはモード切替
addon.port.on('setConohaMode', function (data) {
    $('#add-style').remove();
    if (data){
        $('head link:last').after('<link id="add-style" rel="stylesheet" href="panel_' + data.mode + '.css">');
    }
})

// ローディング表示
addon.port.on('showLoading', function () {
    addon.postMessage({ type: 'resize', value: 123 });
    $('#js__error__auth').hide();
    $('#js__vm-list').empty().hide();
    $('#js__loader').show();
    addon.postMessage({ type: 'resize', value: $(window).height() });
})


// VPSリスト表示
addon.port.on('vmList', function (data) {
    $('#js__loader').hide();
    $('#js__vm-list').show();

    $.each(JSON.parse(data.detail).servers, function (number, vm) {
        $('#js__vm-list').append(template('tmpl__vm-list', {
            'uuid': vm.id,
            'nameTag': vm.metadata.instance_name_tag,
            'vm_state': vm["OS-EXT-STS:vm_state"]
        }));
        $('.vps-list__unit[data-uuid="' + vm.id + '"]').show();
        addon.postMessage({ type: 'getConsoleUrl', value: { region: data.region, uuid: vm.id, type: 'vnc' } });
        addon.postMessage({ type: 'getConsoleUrl', value: { region: data.region, uuid: vm.id, type: 'serial' } });
    });
    addon.postMessage({ type: 'resize', value: $(window).height() });
})

// コンソールURL埋め込み
addon.port.on('setConsoleUrl', function (data) {
    $('.vps-list__unit[data-uuid="' + data.uuid + '"] .js__' + data.type).attr('href', data.url);
})

// 認証エラー表示
addon.port.on('showAuthError', function (data) {
    $('#js__loader').hide();
    if (data){
        $('#js__input__api-user-name').val(data.apiUserName);
        $('#js__input__api-password').val(data.apiPassword);
    }
    $('#js__error__auth').show();
    addon.postMessage({ type: 'resize', value: $(window).height() });
})

// 認証開始
$('#js__error__auth').submit(function (e) {
    if ($('#js__input__api-user-name').val() && $('#js__input__api-password').val()) {
        addon.postMessage({
            type: 'retry',
            value: {
                apiUserName: $('#js__input__api-user-name').val(),
                apiPassword: $('#js__input__api-password').val()
            }
        });
    }
    return false;
});