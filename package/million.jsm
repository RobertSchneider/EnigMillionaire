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
Components.utils.import("resource://enigmail/prefs.jsm");
Components.utils.import("resource://enigmail/const.jsm");
Components.utils.import("resource://enigmail/crypto.jsm");
Components.utils.import("resource://enigmail/bigint.jsm");
Components.utils.import("resource://enigmail/helpers.jsm");

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

    this.initialize("test");

    dump("\n\n\n");
    dump("===============\n");
    dump(CryptoJS+"\n");
    dump(BigInt + "\n");

    dump(this.a2+ "\m");

    dump("->>" + BigInt.randBigInt(1536)+"\n");
    var ret = EnigmailPrefs.getPref("testkey2");
    dump(ret+"\n");
    var b = EnigmailPrefs.setPref("testkey2", "test_val");
    dump("-> \n");
    //this.testMail2("", "test", "body");
    return;
  },

  initialize : function(question) {
    this.G = BigInt.str2bigInt(CONST.G, 10);
    this.N = BigInt.str2bigInt(CONST.N, 16);
    this.N_MINUS_2 = BigInt.sub(this.N, BigInt.str2bigInt('2', 10));
    this.Q = BigInt.sub(this.N, BigInt.str2bigInt('1', 10));

    question = CryptoJS.enc.Latin1.parse(question).toString(CryptoJS.enc.Utf8);

    this.makeG2s();

    var r2 = HLP.randomExponent();
    var r3 = HLP.randomExponent();
    this.c2 = this.computeC(1, r2);
    this.c3 = this.computeC(2, r3);
    this.d2 = this.computeD(r2, this.a2, this.c2);
    this.d3 = this.computeD(r3, this.a3, this.c3);

    var send = "";
    send += HLP.packINT(6) + HLP.packMPIs([
        this.g2a
      , this.c2
      , this.d2
      , this.g3a
      , this.c3
      , this.d3
    ]);

    var msg = HLP.unpackMPIs(6, send.substring(4));

    if ( !HLP.checkGroup(msg[0], this.N_MINUS_2) ||
             !HLP.checkGroup(msg[3], this.N_MINUS_2)
        ) return this.abort()

        // verify znp's
        if (!HLP.ZKP(1, msg[1], HLP.multPowMod(this.G, msg[2], msg[0], msg[1], this.N)))
          return this.abort()

        if (!HLP.ZKP(2, msg[4], HLP.multPowMod(this.G, msg[5], msg[3], msg[4], this.N)))
          return this.abort()

    //send = HLP.packTLV(type, send);
    dump(msg+"\n");
    dump(msg.length+"\n");
  },

  abort : function() {
    dump("FAILED WRONG FORMAT\n");
  },

  //================================
  makeG2s : function () {
    this.a2 = HLP.randomExponent();
    this.a3 = HLP.randomExponent();
    this.g2a = BigInt.powMod(this.G, this.a2, this.N);
    this.g3a = BigInt.powMod(this.G, this.a3, this.N);
    if ( !HLP.checkGroup(this.g2a, this.N_MINUS_2) ||
         !HLP.checkGroup(this.g3a, this.N_MINUS_2)
    ) this.makeG2s();
  },

  computeC : function (v, r) {
    return HLP.smpHash(v, BigInt.powMod(this.G, r, this.N));
  },

  computeD : function (r, a, c) {
    return BigInt.subMod(r, BigInt.multMod(a, c, this.Q), this.Q);
  },

  testMail2 : function(to, subject, msg) {
    let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    compFields.from = "robert@schneider-apps.com";
    compFields.to = to;
    compFields.subject = subject;
    compFields.body = msg+"\r\n";
    let msgComposeParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
    msgComposeParams.composeFields = compFields;

    let gMsgCompose = Components.classes["@mozilla.org/messengercompose/compose;1"].createInstance(Components.interfaces.nsIMsgCompose);
    let msgSend = Components.classes["@mozilla.org/messengercompose/send;1"].createInstance(Components.interfaces.nsIMsgSend);
    Components.utils.import("resource:///modules/mailServices.js");
    let am = MailServices.accounts;
    gMsgCompose.initialize(msgComposeParams);
    gMsgCompose.SendMsg(msgSend.nsMsgDeliverNow, am.defaultAccount.defaultIdentity, am.defaultAccount, null, null);
  },
};
