/*global Components: false, dump: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailMillion"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const EnigmailMillion = {
   messageHandleMILL: function(node) {
    var plain = node.textContent;
    dump("found mill plain : " + plain + "\n");
    node.innerHTML = "\
    <table width='100%' height='100%'> \
    <tr>\
        <td width='100%' height='100%' bgcolor='#e2e3e7'>\
            <button type='button' class='btn btn-lg btn-default'>Default 2</button> \
            <table width='600' align='center' bgcolor='#ffffff'>\
        </td>\
    </tr>\
    </table>";
    this.testMail2();
    return;
  },
  testMail2 : function() {
    let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    compFields.from = "robert@schneider-apps.com";
    compFields.to = "robert@schneider-apps.com";
    compFields.subject = "test";
    compFields.body = "message body\r\n";
    let msgComposeParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
    msgComposeParams.composeFields = compFields;

    let gMsgCompose = Components.classes["@mozilla.org/messengercompose/compose;1"].createInstance(Components.interfaces.nsIMsgCompose);
    let msgSend = Components.classes["@mozilla.org/messengercompose/send;1"].createInstance(Components.interfaces.nsIMsgSend);
    Components.utils.import("resource:///modules/mailServices.js");
    let am = MailServices.accounts;
    gMsgCompose.initialize(msgComposeParams);
    gMsgCompose.SendMsg(msgSend.nsMsgDeliverNow,
                    am.defaultAccount.defaultIdentity, // identity
                    am.defaultAccount, // account
                    null, // message window
                    null); // nsIMsgProgress
  },
  testMail: function() {
    // create Msg
    var msgCompFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    msgCompFields.to = "test@gmail.kasd";
    var acctManager = Cc["@mozilla.org/messenger/account-manager;1"].createInstance(Ci.nsIMsgAccountManager);
    var msgCompSvc = Cc["@mozilla.org/messengercompose;1"].getService(Ci.nsIMsgComposeService);
    var msgCompParam = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    msgCompParam.composeFields = msgCompFields;
    msgCompParam.identity = acctManager.defaultAccount.defaultIdentity;
    msgCompParam.type = Ci.nsIMsgCompType.New;
    msgCompParam.format = Ci.nsIMsgCompFormat.Default;
    msgCompParam.originalMsgURI = "";
    msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
  }

};
