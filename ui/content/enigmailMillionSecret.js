function trim(str) {
  return str.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/, "");
}

Components.utils.import("resource://enigmail/million.jsm");

function onLoad() {
  dump("load! \n");
  /*var keyserver = window.arguments[INPUT].keyserver;
  var protocol = "";
  if (keyserver.search(/^[a-zA-Z0-9\-\_\.]+:\/\//) === 0) {
    protocol = keyserver.replace(/^([a-zA-Z0-9\-\_\.]+)(:\/\/.*)/, "$1");
    keyserver = keyserver.replace(/^[a-zA-Z0-9\-\_\.]+:\/\//, "");
  }
  else {
    protocol = "hkp";
  }

  var port = "";
  switch (protocol) {
    case "hkp":
      port = ENIG_DEFAULT_HKP_PORT;
      break;
    case "hkps":
      port = ENIG_DEFAULT_HKPS_PORT;
      break;
    case "ldap":
      port = ENIG_DEFAULT_LDAP_PORT;
      break;
  }

  var m = keyserver.match(/^(.+)(:)(\d+)$/);
  if (m && m.length == 4) {
    keyserver = m[1];
    port = m[3];
  }

  gEnigRequest = {
    searchList: window.arguments[INPUT].searchList,
    keyNum: 0,
    keyserver: keyserver,
    port: port,
    protocol: protocol,
    keyList: [],
    requestType: (EnigmailPrefs.getPref("useGpgKeysTool") ? ENIG_CONN_TYPE_GPGKEYS : ENIG_CONN_TYPE_HTTP),
    gpgkeysRequest: null,
    progressMeter: document.getElementById("dialog.progress"),
    httpInProgress: false
  };

  gEnigRequest.progressMeter.mode = "undetermined";

  if (window.arguments[INPUT].searchList.length == 1 &&
    window.arguments[INPUT].searchList[0].search(/^0x[A-Fa-f0-9]{8,16}$/) === 0) {
    // shrink dialog and start download if just one key ID provided

    gEnigRequest.dlKeyList = window.arguments[INPUT].searchList;
    document.getElementById("keySelGroup").setAttribute("collapsed", "true");
    window.sizeToContent();
    window.resizeBy(0, -320);
    EnigmailEvents.dispatchEvent(startDownload, 10);
  }
  else {
    switch (gEnigRequest.requestType) {
      case ENIG_CONN_TYPE_HTTP:
        enigNewHttpRequest(nsIEnigmail.SEARCH_KEY, enigScanKeys);
        break;
      case ENIG_CONN_TYPE_GPGKEYS:
        enigNewGpgKeysRequest(nsIEnigmail.SEARCH_KEY, enigScanKeys);
        break;
    }
  }*/
  return true;
}


function selectAllKeys() {
  return;
}


function onAccept() {
  var searchTxt = document.getElementById("secret").value;
  if (searchTxt == "") return;
  EnigmailMillion.hasReadSecret(searchTxt);
  return;
}

function onCancel() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: onCancel\n");

  window.close();
  return;
}

function enigCloseDialog() {
  document.getElementById("enigmailMillionSecretDlg").cancelDialog();
  window.close();
  return;
}

function onSecretInput() {
  dump("secret");
  var searchTxt = document.getElementById("secret").value;
  var accept = document.getElementById("dialog.accept");
  if (searchTxt == "") accept.enabled = false;
  else accept.enabled = true;
}
