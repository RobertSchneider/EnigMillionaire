/*global Components: false, EnigmailLocale: false, EnigmailData: false, EnigmailDialog: false */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "MPL"); you may not use this file
 * except in compliance with the MPL. You may obtain a copy of
 * the MPL at http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the MPL for the specific language governing
 * rights and limitations under the MPL.
 *
 * The Original Code is Enigmail.
 *
 * The Initial Developer of the Original Code is Patrick Brunschwig.
 * Portions created by Patrick Brunschwig <patrick@enigmail.net> are
 * Copyright (C) 2004 Patrick Brunschwig. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * ***** END LICENSE BLOCK ***** */

// Uses: chrome://enigmail/content/enigmailCommon.js

const INPUT = 0;
const RESULT = 1;

const ENIG_DEFAULT_HKP_PORT = "11371";
const ENIG_DEFAULT_HKPS_PORT = "443";
const ENIG_DEFAULT_LDAP_PORT = "389";

const ENIG_CONN_TYPE_HTTP = 1;
const ENIG_CONN_TYPE_GPGKEYS = 2;
const ENIG_CONN_TYPE_KEYBASE = 3;

const KEY_EXPIRED = "e";
const KEY_REVOKED = "r";
const KEY_INVALID = "i";
const KEY_DISABLED = "d";
const KEY_NOT_VALID = KEY_EXPIRED + KEY_REVOKED + KEY_INVALID + KEY_DISABLED;

var gErrorData = "";
var gOutputData = "";
var gEnigRequest;
var gEnigHttpReq = null;
var gAllKeysSelected = 0;

function trim(str) {
  return str.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/, "");
}

function onLoad() {

  window.arguments[RESULT].importedKeys = 0;

  var keyserver = window.arguments[INPUT].keyserver;
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
  }
  return true;
}


function selectAllKeys() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: selectAllkeys\n");
  var keySelList = document.getElementById("enigmailKeySel");
  var treeChildren = keySelList.getElementsByAttribute("id", "enigmailKeySelChildren")[0];

  gEnigRequest.dlKeyList = [];

  // Toggle flag to select/deselect all when hotkey is pressed repeatedly
  gAllKeysSelected ^= 1;

  var item = treeChildren.firstChild;
  while (item) {
    var aRows = item.getElementsByAttribute("id", "indicator");
    if (aRows.length) {
      var elem = aRows[0];
      EnigSetActive(elem, gAllKeysSelected);
    }
    item = item.nextSibling;
  }
}


function onAccept() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: onAccept\n");

  var keySelList = document.getElementById("enigmailKeySel");
  var treeChildren = keySelList.getElementsByAttribute("id", "enigmailKeySelChildren")[0];

  gEnigRequest.dlKeyList = [];
  var item = treeChildren.firstChild;
  while (item) {
    var aRows = item.getElementsByAttribute("id", "indicator");
    if (aRows.length) {
      var elem = aRows[0];
      if (elem.getAttribute("active") == "1") {
        gEnigRequest.dlKeyList.push(item.getAttribute("id"));
      }
    }
    item = item.nextSibling;
  }
  return startDownload();
}


function startDownload() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: startDownload\n");
  if (gEnigRequest.dlKeyList.length > 0) {
    gEnigRequest.progressMeter.value = 0;
    gEnigRequest.progressMeter.mode = "undetermined";
    document.getElementById("progress.box").removeAttribute("hidden");
    document.getElementById("selall-button").setAttribute("hidden", "true");
    document.getElementById("dialog.accept").setAttribute("disabled", "true");
    gEnigRequest.keyNum = 0;
    gEnigRequest.errorTxt = "";
    switch (gEnigRequest.requestType) {
      case ENIG_CONN_TYPE_HTTP:
        enigNewHttpRequest(nsIEnigmail.DOWNLOAD_KEY, enigImportKeys);
        break;
      case ENIG_CONN_TYPE_GPGKEYS:
        enigNewGpgKeysRequest(nsIEnigmail.DOWNLOAD_KEY, enigImportKeys);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        enigNewHttpRequest(nsIEnigmail.DOWNLOAD_KEY, enigImportKeys);
        break;
    }

    // do not yet close the window, so that we can display some progress info
    return false;
  }

  return true;
}

function onCancel() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: onCancel\n");

  if (gEnigRequest.httpInProgress) {
    // stop download
    try {
      if ((typeof(gEnigHttpReq) == "object") &&
        (gEnigHttpReq.readyState != 4)) {
        gEnigHttpReq.abort();
      }
      gEnigRequest.httpInProgress = false;
    }
    catch (ex) {}
  }

  if (gEnigRequest.gpgkeysRequest) {

    try {
      var p = gEnigRequest.gpgkeysRequest;
      gEnigRequest.gpgkeysRequest = null;
      p.kill(false);
    }
    catch (ex) {}
  }

  gOutputData = "";
  window.close();
}


function enigStatusError() {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigStatusError\n");
  gEnigRequest.httpInProgress = false;
  EnigmailDialog.alert(window, EnigmailLocale.getString("noKeyserverConn", this.channel.originalURI.prePath));
  enigCloseDialog();
}

function enigCloseDialog() {
  if (window.arguments[RESULT].importedKeys > 0) {
    EnigmailKeyRing.clearCache();
  }

  document.getElementById("enigmailSearchKeyDlg").cancelDialog();
  window.close();
}

function enigStatusLoadedKeybase(event) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigStatusLoadedKeybase\n");

  if (this.status === 200) {
    this.requestCallbackFunc(ENIG_CONN_TYPE_KEYBASE, this.responseText, "");
  }
  else {
    EnigmailDialog.alert(window, EnigmailLocale.getString("keyDownloadFailed", this.statusText));
    enigCloseDialog();
    return;
  }
}

function enigStatusLoaded(event) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigStatusLoaded\n");

  if (this.status == 200) {
    // de-HTMLize the result
    var htmlTxt = this.responseText.replace(/<([^<>]+)>/g, "");

    this.requestCallbackFunc(ENIG_CONN_TYPE_HTTP, htmlTxt, "");
  }
  else if (this.status == 500 && this.statusText == "OK") {
    this.requestCallbackFunc(ENIG_CONN_TYPE_HTTP, "no keys found", "[GNUPG:] NODATA 1\n");
  }
  else if (this.statusText != "OK") {
    EnigmailDialog.alert(window, EnigmailLocale.getString("keyDownloadFailed", this.statusText));
    enigCloseDialog();
    return;
  }

}


function enigImportKeys(connType, txt, errorTxt) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigImportKeys\n");

  gEnigRequest.keyNum++;
  gEnigRequest.progressMeter.mode = "determined";
  gEnigRequest.progressMeter.value = (100 * gEnigRequest.keyNum / gEnigRequest.dlKeyList.length).toFixed(0);

  if (connType == ENIG_CONN_TYPE_KEYBASE) {
    enigImportKeybaseKeys(txt);
  }
  else {
    if (errorTxt.search(/^\[GNUPG:\] IMPORT_RES/m) < 0) {
      if (!enigImportHtmlKeys(txt)) return;
    }
    else if (errorTxt) {
      let resStatusObj = {};

      gEnigRequest.errorTxt = EnigmailErrorHandling.parseErrorOutput(errorTxt, resStatusObj) + "\n";
    }

    if (errorTxt.search(/^\[GNUPG:\] IMPORT_RES/m) >= 0) {
      window.arguments[RESULT].importedKeys++;
    }
  }

  if (gEnigRequest.dlKeyList.length > gEnigRequest.keyNum) {
    switch (connType) {
      case ENIG_CONN_TYPE_HTTP:
        enigNewHttpRequest(nsIEnigmail.DOWNLOAD_KEY, gEnigHttpReq.requestCallbackFunc);
        break;
      case ENIG_CONN_TYPE_GPGKEYS:
        enigNewGpgKeysRequest(nsIEnigmail.DOWNLOAD_KEY, gEnigRequest.callbackFunction);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        enigNewHttpRequest(nsIEnigmail.DOWNLOAD_KEY, gEnigHttpReq.requestCallbackFunc);
    }
    return;
  }
  else if (gEnigRequest.errorTxt) {
    EnigmailDialog.longAlert(window, EnigmailData.convertGpgToUnicode(gEnigRequest.errorTxt));
  }

  gEnigRequest.httpInProgress = false;

  enigCloseDialog();
}

function enigImportHtmlKeys(txt) {
  var errorMsgObj = {};

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc)
    return false;

  var r = EnigmailKeyRing.importKey(window, true, txt,
    gEnigRequest.dlKeyList[gEnigRequest.keyNum - 1],
    errorMsgObj);
  if (errorMsgObj.value)
    EnigmailDialog.alert(window, errorMsgObj.value);
  if (r === 0) {
    window.arguments[RESULT].importedKeys++;
    return true;
  }
  return false;
}

function enigImportKeybaseKeys(txt) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigImportKeybaseKeys\n");
  var errorMsgObj = {};

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc)
    return false;

  var resp = JSON.parse(txt);

  if (resp.status.code === 0) {
    for (var hit in resp.them) {
      EnigmailLog.DEBUG(JSON.stringify(resp.them[hit].public_keys.primary) + "\n");

      if (resp.them[hit] !== null) {
        var uiFlags = nsIEnigmail.UI_ALLOW_KEY_IMPORT;
        var r = EnigmailKeyRing.importKey(window, uiFlags,
          resp.them[hit].public_keys.primary.bundle,
          gEnigRequest.dlKeyList[gEnigRequest.keyNum - 1],
          errorMsgObj);

        if (errorMsgObj.value) {
          EnigmailDialog.alert(window, errorMsgObj.value);
        }

        if (r === 0) {
          window.arguments[RESULT].importedKeys++;
        }
      }
    }
  }
}


function enigNewHttpRequest(requestType, requestCallbackFunc) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigNewHttpRequest\n");

  switch (gEnigRequest.protocol) {
    case "hkp":
      gEnigRequest.protocol = "http";
      break;
    case "hkps":
      gEnigRequest.protocol = "https";
      break;
    case "http":
    case "https":
    case "keybase":
      break;
    default:
      var msg = EnigmailLocale.getString("protocolNotSupported", gEnigRequest.protocol);
      if (!EnigmailPrefs.getPref("useGpgKeysTool"))
        msg += " " + EnigmailLocale.getString("gpgkeysDisabled");
      EnigmailDialog.alert(window, msg);
      enigCloseDialog();
      return;
  }

  var httpReq = new XMLHttpRequest();
  var reqCommand;
  switch (requestType) {
    case nsIEnigmail.SEARCH_KEY:
      var pubKey = trim(gEnigRequest.searchList[gEnigRequest.keyNum]);

      if (gEnigRequest.protocol == "keybase") {
        reqCommand = "https://keybase.io/_/api/1.0/user/autocomplete.json?q=" + escape(pubKey);
      }
      else {
        pubKey = escape("<" + pubKey + ">");
        reqCommand = gEnigRequest.protocol + "://" + gEnigRequest.keyserver + ":" + gEnigRequest.port + "/pks/lookup?search=" + pubKey + "&op=index";
      }
      break;
    case nsIEnigmail.DOWNLOAD_KEY:
      var keyId = escape(trim(gEnigRequest.dlKeyList[gEnigRequest.keyNum]));

      EnigmailLog.DEBUG("enigmailSearchKey.js: keyId: " + keyId + "\n");

      if (gEnigRequest.protocol == "keybase") {
        reqCommand = "https://keybase.io/_/api/1.0/user/lookup.json?key_fingerprint=" + escape(keyId.substr(2, 40)) + "&fields=public_keys";
      }
      else {
        reqCommand = gEnigRequest.protocol + "://" + gEnigRequest.keyserver + ":" + gEnigRequest.port + "/pks/lookup?search=" + keyId + "&op=get";
      }
      break;
    default:
      EnigmailDialog.alert(window, "Unknown request type " + requestType);
      return;
  }

  gEnigRequest.httpInProgress = true;
  httpReq.open("GET", reqCommand);
  httpReq.onerror = enigStatusError;

  if (gEnigRequest.protocol == "keybase") {
    httpReq.onload = enigStatusLoadedKeybase;
  }
  else {
    httpReq.onload = enigStatusLoaded;
  }

  httpReq.requestCallbackFunc = requestCallbackFunc;
  gEnigHttpReq = httpReq;
  httpReq.send("");
}


function enigScanKeys(connType, htmlTxt) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigScanKeys\n");

  gEnigRequest.keyNum++;
  gEnigRequest.progressMeter.mode = "determined";
  gEnigRequest.progressMeter.value = (100 * gEnigRequest.keyNum / gEnigRequest.searchList.length).toFixed(0);

  switch (connType) {
    case ENIG_CONN_TYPE_HTTP:
      // interpret HTML codes (e.g. &lt;)
      var domParser = new DOMParser();
      // needs improvement: result is max. 4096 bytes long!
      var htmlNode = domParser.parseFromString("<p>" + htmlTxt + "</p>", "text/xml");

      if (htmlNode.firstChild.nodeName == "parsererror") {
        EnigmailDialog.alert(window, "internalError");
        return false;
      }
      enigScanHtmlKeys(htmlNode.firstChild.firstChild.data);
      break;
    case ENIG_CONN_TYPE_GPGKEYS:
      enigScanGpgKeys(EnigmailData.convertGpgToUnicode(htmlTxt));
      break;
    case ENIG_CONN_TYPE_KEYBASE:
      EnigmailLog.DEBUG("enigmailSearchKey.js: htmlTxt: " + htmlTxt + "\n");
      var resp = JSON.parse(htmlTxt);

      if (resp.status.code === 0) {
        enigScanKeybaseKeys(resp.completions);
      }
      else {
        EnigmailDialog.alert(window, "Internal Error: " + resp.status.name);
        return false;
      }
      break;
    default:
      EnigmailLog.ERROR("Unkonwn connType: " + connType + "\n");
  }

  if (gEnigRequest.searchList.length > gEnigRequest.keyNum) {
    switch (connType) {
      case ENIG_CONN_TYPE_HTTP:
        enigNewHttpRequest(nsIEnigmail.SEARCH_KEY, gEnigHttpReq.requestCallbackFunc);
        break;
      case ENIG_CONN_TYPE_GPGKEYS:
        enigNewGpgKeysRequest(nsIEnigmail.SEARCH_KEY, gEnigRequest.callbackFunction);
        break;
      case ENIG_CONN_TYPE_KEYBASE:
        enigNewGpgKeysRequest(nsIEnigmail.SEARCH_KEY, gEnigHttpReq.requestCallbackFunc);
    }
    return true;
  }

  gEnigRequest.httpInProgress = false;
  enigPopulateList(gEnigRequest.keyList);
  document.getElementById("progress.box").setAttribute("hidden", "true");
  document.getElementById("selall-button").removeAttribute("hidden");
  if (gEnigRequest.keyList.length === 0) {
    EnigmailDialog.alert(window, EnigmailLocale.getString("noKeyFound"));
    enigCloseDialog();
  }

  document.getElementById("dialog.accept").removeAttribute("disabled");

  return true;
}

function enigScanKeybaseKeys(completions) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigScanKeybaseKeys\n");

  for (var hit in completions) {
    if (completions[hit] && completions[hit].components.key_fingerprint !== undefined) {
      //      var date = new Date(parseInt(them[hit].components.public_keys.primary.ctime,10) * 1000);

      try {
        var key = {
          keyId: completions[hit].components.key_fingerprint.val,
          created: 0, //date.toDateString(),
          uid: [completions[hit].components.username.val + " (" + completions[hit].components.full_name.val + ")"],
          status: ""
        };

        gEnigRequest.keyList.push(key);
      }
      catch (e) {}
    }
  }
}

function enigScanHtmlKeys(txt) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigScanHtmlKeys\n");

  var lines = txt.split(/(\n\r|\n|\r)/);
  var key;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].search(/^\s*pub /) === 0) {
      // new key
      if (key) {
        // first, append prev. key to keylist
        gEnigRequest.keyList.push(key);
      }
      key = null;
      var m = lines[i].match(/(\d+[a-zA-Z]?\/)([0-9a-fA-F]+)(\s+[\d\/\-\.]+\s+)(.*)/);
      if (m && m.length > 0) {
        key = {
          keyId: m[2],
          created: m[3],
          uid: [],
          status: ""
        };
        if (m[4].search(/.+<.+@.+>/) >= 0) {
          if (!ignoreUid(m[4])) key.uid.push(trim(m[4]));
        }
        else if (m[4].search(/key (revoked|expired|disabled)/i) >= 0) {
          EnigmailLog.DEBUG("revoked key id " + m[4] + "\n");
          key = null;
        }
      }
    }
    else {
      // amend to key
      if (key) {
        var uid = trim(lines[i]);
        if (uid.length > 0 && !ignoreUid(uid))
          key.uid.push(uid);
      }
    }
  }

  // append prev. key to keylist
  if (key) {
    gEnigRequest.keyList.push(key);
  }
}

/**
 * Unescape output from keysearch and convert UTF-8 to Unicode.
 * Output looks like this:
 * uid:Ludwig H%C3%BCgelsch%C3%A4fer <ludwig@hammernoch.net>:1240988030::
 *
 * @txt - String to convert in ASCII format
 *
 * @return - Unicode representation
 */
function unescapeAndConvert(txt) {
  return EnigmailData.convertToUnicode(unescape(txt), "utf-8");
}

function enigScanGpgKeys(txt) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigScanGpgKeys\n");
  EnigmailLog.DEBUG("got text: " + txt + "\n");

  // protocol version 0: GnuPG 1.2 and older versions of GnuPG 1.4.x
  // protocol version 1: GnuPG 2.x and newer versions of GnuPG 1.4.x

  var lines = txt.split(/(\r\n|\n|\r)/);
  var outputType = 0;
  var key;
  for (var i = 0; i < lines.length; i++) {
    if (outputType === 0 && lines[i].search(/^COUNT \d+\s*$/) === 0) {
      outputType = 1;
      continue;
    }
    if (outputType === 0 && lines[i].search(/^info:\d+:\d+/) === 0) {
      outputType = 2;
      continue;
    }
    if (outputType === 0 && lines[i].search(/^pub:[\da-fA-F]{8}/) === 0) {
      outputType = 2;
    }
    var m, dat, month, day;
    if (outputType == 1 && (lines[i].search(/^([a-fA-F0-9]{8}){1,2}:/)) === 0) {
      // output from gpgkeys_* protocol version 0
      // new key
      m = lines[i].split(/:/).map(unescape);
      if (m && m.length > 0) {
        if (key) {
          if (key.keyId == m[0]) {
            if (!ignoreUid(m[i])) key.uid.push(trim(m[1]));
          }
          else {
            gEnigRequest.keyList.push(key);
            key = null;
          }
        }
        if (!key) {
          dat = new Date(m[3] * 1000);
          month = String(dat.getMonth() + 101).substr(1);
          day = String(dat.getDate() + 100).substr(1);
          key = {
            keyId: m[0],
            created: dat.getFullYear() + "-" + month + "-" + day,
            uid: [],
            status: ""

          };
          if (!ignoreUid(m[1])) key.uid.push(m[1]);
        }
      }
    }
    if (outputType == 2 && (lines[i].search(/^pub:/)) === 0) {
      // output from gpgkeys_* protocol version 1
      // new key
      m = lines[i].split(/:/).map(unescape);
      if (m && m.length > 1) {
        if (key) {
          gEnigRequest.keyList.push(key);
          key = null;
        }
        dat = new Date(m[4] * 1000);
        month = String(dat.getMonth() + 101).substr(1);
        day = String(dat.getDate() + 100).substr(1);
        key = {
          keyId: m[1],
          created: dat.getFullYear() + "-" + month + "-" + day,
          uid: [],
          status: (m.length >= 5 ? m[6] : "")
        };
      }
    }
    if (outputType == 2 && (lines[i].search(/^uid:.+/)) === 0) {
      // output from gpgkeys_* protocol version 1
      // uid for key
      m = lines[i].split(/:/).map(unescapeAndConvert);
      if (m && m.length > 1) {
        if (key && !ignoreUid(m[1])) key.uid.push(trim(m[1]));
      }
    }
  }

  // append prev. key to keylist
  if (key) {
    gEnigRequest.keyList.push(key);
  }
}

// interaction with gpgkeys_xxx

function enigNewGpgKeysRequest(requestType, callbackFunction) {
  EnigmailLog.DEBUG("enigmailSearchkey.js: enigNewGpgKeysRequest\n");

  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigmailDialog.alert(window, EnigmailLocale.getString("accessError"));
    return;
  }

  gEnigRequest.callbackFunction = callbackFunction;
  gEnigRequest.gpgkeysRequest = null;

  gErrorData = "";
  gOutputData = "";

  var procListener = {
    done: function(exitCode) {
      enigmailGpgkeysTerminate(exitCode);
    },
    stdout: function(data) {
      gOutputData += data;
    },
    stderr: function(data) {
      gErrorData += data;
    }
  };

  var keyValue;
  if (requestType == nsIEnigmail.SEARCH_KEY) {
    keyValue = gEnigRequest.searchList[gEnigRequest.keyNum];
  }
  else {
    keyValue = gEnigRequest.dlKeyList[gEnigRequest.keyNum];
  }

  var keyServer = "";
  if (gEnigRequest.protocol) keyServer = gEnigRequest.protocol + "://";
  keyServer += gEnigRequest.keyserver;
  if (gEnigRequest.port) keyServer += ":" + gEnigRequest.port;

  if (gEnigRequest.protocol == "keybase") {
    gEnigRequest.requestType = ENIG_CONN_TYPE_KEYBASE;
    enigNewHttpRequest(requestType, enigScanKeys);
  }
  else {
    var errorMsgObj = {};
    gEnigRequest.gpgkeysRequest = EnigmailKeyServer.access(requestType,
      keyServer,
      keyValue,
      procListener,
      errorMsgObj);

    if (!gEnigRequest.gpgkeysRequest) {
      // calling gpgkeys_xxx failed, let's try builtin http variant
      switch (gEnigRequest.protocol) {
        case "hkp":
        case "http":
        case "https":
          gEnigRequest.requestType = ENIG_CONN_TYPE_HTTP;
          enigNewHttpRequest(requestType, enigScanKeys);
          return;
        default:
          EnigmailDialog.alert(window, EnigmailLocale.getString("gpgKeysFailed", gEnigRequest.protocol));
          enigCloseDialog();
          return;
      }
    }

    EnigmailLog.DEBUG("enigmailSearchkey.js: Start: gEnigRequest.gpgkeysRequest = " + gEnigRequest.gpgkeysRequest + "\n");
  }
}


function enigmailGpgkeysTerminate(exitCode) {
  EnigmailLog.DEBUG("enigmailSearchkey.js: enigmailGpgkeysTerminate: exitCode=" + exitCode + "\n");

  gEnigRequest.gpgkeysRequest = null;

  try {
    if (gErrorData.length > 0) {
      EnigmailLog.DEBUG("enigmailSearchkey.js: Terminate(): stderr has data:\n");
      EnigmailLog.CONSOLE(gErrorData + "\n");
    }

    // ignore exit code --> try next key if any
    gEnigRequest.callbackFunction(ENIG_CONN_TYPE_GPGKEYS, gOutputData, gErrorData);

  }
  catch (ex) {}
}

// GUI related stuff

function enigPopulateList(keyList) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigPopulateList\n");

  var sortUsers = function(a, b) {
    if (a.uid[0] < b.uid[0]) {
      return -1;
    }
    else {
      return 1;
    }
  };

  var sortKeyIds = function(c, d) {
    if (c.keyId < d.keyId) {
      return -1;
    }
    else {
      return 1;
    }
  };

  keyList.sort(sortKeyIds);

  // remove duplicates
  var z = 0;
  while (z < keyList.length - 1) {
    if (keyList[z].keyId == keyList[z + 1].keyId) {
      keyList.splice(z, 1);
    }
    else {
      z = z + 1;
    }
  }

  keyList.sort(sortUsers);

  var treeList = document.getElementById("enigmailKeySel");
  var treeChildren = treeList.getElementsByAttribute("id", "enigmailKeySelChildren")[0];
  var treeItem;

  for (var i = 0; i < keyList.length; i++) {
    treeItem = enigUserSelCreateRow(keyList[i].keyId, false, keyList[i].uid[0], keyList[i].created, keyList[i].status);
    if (keyList[i].uid.length > 1) {
      treeItem.setAttribute("container", "true");
      var subChildren = document.createElement("treechildren");
      for (j = 1; j < keyList[i].uid.length; j++) {
        var subItem = enigUserSelCreateRow(keyList[i].keyId, true, keyList[i].uid[j], "", keyList[i].status);
        subChildren.appendChild(subItem);
      }
      treeItem.appendChild(subChildren);
    }
    treeChildren.appendChild(treeItem);
  }

  if (keyList.length == 1) {
    // activate found item if just one key found
    EnigSetActive(treeItem.firstChild.firstChild, 1);
  }
}

function enigUserSelCreateRow(keyId, subKey, userId, dateField, trustStatus) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigUserSelCreateRow\n");
  var selectCol = document.createElement("treecell");
  selectCol.setAttribute("id", "indicator");
  var expCol = document.createElement("treecell");
  var userCol = document.createElement("treecell");
  userCol.setAttribute("id", "name");
  if (trustStatus.indexOf(KEY_EXPIRED) >= 0) {
    expCol.setAttribute("label", EnigmailLocale.getString("selKeyExpired", dateField));
  }
  else {
    expCol.setAttribute("label", dateField);
  }

  expCol.setAttribute("id", "expiry");
  userCol.setAttribute("label", userId);
  var keyCol = document.createElement("treecell");
  keyCol.setAttribute("id", "keyid");
  if (subKey) {
    EnigSetActive(selectCol, -1);
    keyCol.setAttribute("label", "");
  }
  else {
    EnigSetActive(selectCol, 0);
    keyCol.setAttribute("label", keyId.substr(-8));
  }


  var userRow = document.createElement("treerow");
  userRow.appendChild(selectCol);
  userRow.appendChild(userCol);
  userRow.appendChild(expCol);
  userRow.appendChild(keyCol);
  var treeItem = document.createElement("treeitem");
  treeItem.setAttribute("id", "0x" + keyId);

  if (trustStatus.length > 0 && KEY_NOT_VALID.indexOf(trustStatus.charAt(0)) >= 0) {
    // key invalid, mark it in grey
    for (var node = userRow.firstChild; node; node = node.nextSibling) {
      var attr = node.getAttribute("properties");
      if (typeof(attr) == "string") {
        node.setAttribute("properties", attr + " enigKeyInactive");
      }
      else {
        node.setAttribute("properties", "enigKeyInactive");
      }
    }
  }

  treeItem.appendChild(userRow);
  return treeItem;
}

function enigmailKeySelCallback(event) {
  EnigmailLog.DEBUG("enigmailSearchKey.js: enigmailKeySelCallback\n");

  var Tree = document.getElementById("enigmailKeySel");
  var row = {};
  var col = {};
  var elt = {};
  Tree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, elt);
  if (row.value == -1)
    return;


  var treeItem = Tree.contentView.getItemAtIndex(row.value);
  Tree.currentItem = treeItem;
  if (col.value.id != "selectionCol")
    return;

  var aRows = treeItem.getElementsByAttribute("id", "indicator");

  if (aRows.length) {
    var elem = aRows[0];
    if (elem.getAttribute("active") == "1") {
      EnigSetActive(elem, 0);
    }
    else if (elem.getAttribute("active") == "0") {
      EnigSetActive(elem, 1);
    }
  }
}

function ignoreUid(uid) {
  const ignoreList = "{Test 555 <sdfg@gga.com>}";
  return (ignoreList.indexOf("{" + trim(uid) + "}") >= 0);
}
