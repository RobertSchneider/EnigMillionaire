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
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://enigmail/windows.jsm");

const EnigmailMillion = {
  init : function(fpr, ownfpr, to)
  {
    this.tofinger = fpr;
    this.ownfinger = ownfpr;
    this.fromEmail = this.tofinger;
    this.tomail = to;

    dump("verify:"+fpr+ "\n");
    this.G = BigInt.str2bigInt(CONST.G, 10);
    this.N = BigInt.str2bigInt(CONST.N, 16);
    this.N_MINUS_2 = BigInt.sub(this.N, BigInt.str2bigInt('2', 10));
    this.Q = BigInt.sub(this.N, BigInt.str2bigInt('1', 10));
    BigInt.divInt_(this.Q, 2)  // meh
    HLP.CryptoJS = CryptoJS;
    HLP.BigInt = BigInt;
    EnigmailPrefs.setPref(this.fromEmail+"_mill_state", "0");
  },

  messageHandleMILL: function(plain, email, from) {

    this.tomail = from;
    dump("to-email: " + from);

    plain = plain.replace("\n", "");
    plain = plain.replace("\r", "");
    dump("found mill plain : " + plain + "\n");
    var cells = this.passText(this.trimText(plain));

    /*var html = "<table> ";
    for (var i in cells) {
      html += "<tr bgcolor='#e2e3e7'><td>"+ i + "</td><td>" + cells[i] + "</td></tr>";
    };
    html += "</table>";
    node.innerHTML = html;*/

    this.tofinger = cells["tofinger"];
    this.ownfinger = cells["ownfinger"];

    this.fromEmail = this.tofinger;

    if(cells["Status"] == "0")
    {
      this.estatus = 0;
      this.initialize("test");
      return;
    }

    this.processEmail(cells);

    dump("\n\n\n");
    dump("===============\n");

    var ret = EnigmailPrefs.getPref("testkey2");
    dump(ret+"\n");
    var b = EnigmailPrefs.setPref("testkey2", "test_val");
    dump("-> \n");
    return;
  },

  processEmail : function(cells)
  {
    dump(cells["Version"]);
    if (cells["Version"] != "1.0") return;
    dump("\n"+cells["Status"]+"\n");
    this.estatus = parseInt(cells["Status"]);
    if (cells["Status"] == "1") this.answerMsg1(cells);
    if (cells["Status"] == "2") this.answerMsg2(cells);
    if (cells["Status"] == "3") this.answerMsg3(cells);
    if (cells["Status"] == "4") this.answerMsg4(cells);
  },

  //BOB
  answerMsg1 : function(cells)
  {
    var _g2a = BigInt.str2bigInt(cells["g2a"], 16, 0);
    var _c2 = BigInt.str2bigInt(cells["c2"], 16, 0);
    var _d2 = BigInt.str2bigInt(cells["d2"], 16, 0);
    var _g3a = BigInt.str2bigInt(cells["g3a"], 16, 0);
    var _c3 = BigInt.str2bigInt(cells["c3"], 16, 0);
    var _d3 = BigInt.str2bigInt(cells["d3"], 16, 0);

    var msg = [_g2a, _c2, _d2, _g3a, _c3, _d3];

    if ( !HLP.checkGroup(msg[0], this.N_MINUS_2) || !HLP.checkGroup(msg[3], this.N_MINUS_2)) return this.abort()

    // verify znp's
    if (!HLP.ZKP(1, msg[1], HLP.multPowMod(this.G, msg[2], msg[0], msg[1], this.N))) return this.abort()
    if (!HLP.ZKP(2, msg[4], HLP.multPowMod(this.G, msg[5], msg[3], msg[4], this.N))) return this.abort()

    this.g3ao = msg[3]  // save for later

    this.makeG2s()

    // zero-knowledge proof that the exponents
    // associated with g2a & g3a are known
    var r2 = HLP.randomExponent()
    var r3 = HLP.randomExponent()
    this.c2 = this.computeC(3, r2)
    this.c3 = this.computeC(4, r3)
    this.d2 = this.computeD(r2, this.a2, this.c2)
    this.d3 = this.computeD(r3, this.a3, this.c3)

    this.computeGs(msg[0], msg[3])

    EnigmailPrefs.setPref(this.fromEmail+"_mill_g2", BigInt.bigInt2str(this.g2, 16));
    EnigmailPrefs.setPref(this.fromEmail+"_mill_g3", BigInt.bigInt2str(this.g3, 16));
    EnigmailPrefs.setPref(this.fromEmail+"_mill_g3ao", BigInt.bigInt2str(this.g3ao, 16));

    //this.makeG2s();
    //==============ANSWER==================
    //this.secret = BigInt.str2bigInt("666", 10);

    EnigmailPrefs.setPref(this.fromEmail+"_mill_state", "1");

    this.readSecret();
  },

  //ALICE
  answerMsg2 : function(cells)
  {
    this.a2 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_a2"), 16, 0);
    this.a3 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_a3"), 16, 0);

    var _g2a = BigInt.str2bigInt(cells["g2a"], 16, 0);
    var _c2 = BigInt.str2bigInt(cells["c2"], 16, 0);
    var _d2 = BigInt.str2bigInt(cells["d2"], 16, 0);
    var _g3a = BigInt.str2bigInt(cells["g3a"], 16, 0);

    var _c3 = BigInt.str2bigInt(cells["c3"], 16, 0);
    var _d3 = BigInt.str2bigInt(cells["d3"], 16, 0);
    var _p2 = BigInt.str2bigInt(cells["p"], 16, 0);
    var _q2 = BigInt.str2bigInt(cells["q"], 16, 0);
    var _cP = BigInt.str2bigInt(cells["cP"], 16, 0);

    var _d5 = BigInt.str2bigInt(cells["d5"], 16, 0);
    var _d6 = BigInt.str2bigInt(cells["d6"], 16, 0);

    var msg = [_g2a, _c2, _d2, _g3a, _c3, _d3, _p2, _q2, _cP, _d5, _d6];

    if ( !HLP.checkGroup(msg[0], this.N_MINUS_2) || !HLP.checkGroup(msg[3], this.N_MINUS_2) || !HLP.checkGroup(msg[6], this.N_MINUS_2) || !HLP.checkGroup(msg[7], this.N_MINUS_2)) return this.abort()
    // verify znp of c3 / c3
    if (!HLP.ZKP(3, msg[1], HLP.multPowMod(this.G, msg[2], msg[0], msg[1], this.N))) return this.abort()
    if (!HLP.ZKP(4, msg[4], HLP.multPowMod(this.G, msg[5], msg[3], msg[4], this.N))) return this.abort()

    this.g3ao = msg[3]  // save for later

    this.computeGs(msg[0], msg[3])

    this.makeSecret(false, secret);

    // verify znp of cP
    var t1 = HLP.multPowMod(this.g3, msg[9], msg[6], msg[8], this.N)
    var t2 = HLP.multPowMod(this.G, msg[9], this.g2, msg[10], this.N)
    var t2 = BigInt.multMod(t2, BigInt.powMod(msg[7], msg[8], this.N), this.N)
    dump("test3\n");
    if (!HLP.ZKP(5, msg[8], t1, t2)) return this.abort()
    dump("test3 passed\n");
    var r4 = HLP.randomExponent()
    this.computePQ(r4)

    // zero-knowledge proof that P & Q
    // were generated according to the protocol
    var r5 = HLP.randomExponent()
    var r6 = HLP.randomExponent()
    var tmp = HLP.multPowMod(this.G, r5, this.g2, r6, this.N)
    var cP = HLP.smpHash(6, BigInt.powMod(this.g3, r5, this.N), tmp)
    var d5 = this.computeD(r5, r4, cP)
    var d6 = this.computeD(r6, this.secret, cP)

        // store these
    this.QoQ = BigInt.divMod(this.q, msg[7], this.N)
    this.PoP = BigInt.divMod(this.p, msg[6], this.N)

    EnigmailPrefs.setPref(this.fromEmail+"_mill_g3ao", BigInt.bigInt2str(this.g3ao, 16));
    EnigmailPrefs.setPref(this.fromEmail+"_mill_QoQ", BigInt.bigInt2str(this.QoQ, 16));
    EnigmailPrefs.setPref(this.fromEmail+"_mill_PoP", BigInt.bigInt2str(this.PoP, 16));

    this.computeR()

    // zero-knowledge proof that R
    // was generated according to the protocol
    var r7 = HLP.randomExponent()
    var tmp2 = BigInt.powMod(this.QoQ, r7, this.N)
    var cR = HLP.smpHash(7, BigInt.powMod(this.G, r7, this.N), tmp2)
    var d7 = this.computeD(r7, this.a3, cR)

    dump("----->\n");
    dump(BigInt.bigInt2str(this.c2, 16) + "\n");
    dump(BigInt.bigInt2str(HLP.smpHash(3, HLP.multPowMod(this.G, this.d2, this.g2a, this.c2, this.N)), 16) + "\n");

    var send = "";
    send += "p="+BigInt.bigInt2str(this.p, 16)+CONST.LN;
    send += "q="+BigInt.bigInt2str(this.q, 16)+CONST.LN;
    send += "cP="+BigInt.bigInt2str(cP, 16)+CONST.LN;
    send += "d5="+BigInt.bigInt2str(d5, 16)+CONST.LN;
    send += "d6="+BigInt.bigInt2str(d6, 16)+CONST.LN;
    send += "r="+BigInt.bigInt2str(this.r, 16)+CONST.LN;
    send += "cR="+BigInt.bigInt2str(cR, 16)+CONST.LN;
    send += "d7="+BigInt.bigInt2str(d7, 16);

    this.smpSendEmail(send, 3);
  },

  //BOB
  answerMsg3 : function(cells)
  {
    dump("___\n");
    
    this.g2 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g2"), 16, 0);
    this.g3 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g3"), 16, 0);
    this.g3ao = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g3ao"), 16, 0);

dump("___\n");
    var _p = BigInt.str2bigInt(cells["p"], 16, 0);
    var _q = BigInt.str2bigInt(cells["q"], 16, 0);
    var _cP = BigInt.str2bigInt(cells["cP"], 16, 0);
    var _d5 = BigInt.str2bigInt(cells["d5"], 16, 0);

    var _d6 = BigInt.str2bigInt(cells["d6"], 16, 0);
    var _r = BigInt.str2bigInt(cells["r"], 16, 0);
    var _cR = BigInt.str2bigInt(cells["cR"], 16, 0);
    var _d7 = BigInt.str2bigInt(cells["d7"], 16, 0);
    dump("test1\n");
    var msg = [_p, _q, _cP, _d5, _d6, _r, _cR, _d7];
    if ( !HLP.checkGroup(msg[0], this.N_MINUS_2) || !HLP.checkGroup(msg[1], this.N_MINUS_2) || !HLP.checkGroup(msg[5], this.N_MINUS_2)) return this.abort()
dump("test2\n");
    // verify znp of cP

    var t1 = HLP.multPowMod(this.g3, msg[3], msg[0], msg[2], this.N)
    var t2 = HLP.multPowMod(this.G, msg[3], this.g2, msg[4], this.N)
    var t2 = BigInt.multMod(t2, BigInt.powMod(msg[1], msg[2], this.N), this.N)

    dump("\n\n\n======\n");
    dump(BigInt.bigInt2str(this.g3, 16)+"\n");
    dump(BigInt.bigInt2str(msg[3], 16)+"\n");
    dump(BigInt.bigInt2str(msg[0], 16)+"\n");
    dump(BigInt.bigInt2str(msg[2], 16)+"\n");
    dump(BigInt.bigInt2str(this.N, 16)+"\n");
    dump(BigInt.bigInt2str(t1, 16)+"\n");
    dump("======\n");
dump("test3\n");
    if (!HLP.ZKP(6, msg[2], t1, t2)) return this.abort()
dump("test4\n");
    // verify znp of cR
    var t3 = HLP.multPowMod(this.G, msg[7], this.g3ao, msg[6], this.N)
    this.QoQ = BigInt.divMod(msg[1], this.q, this.N)  // save Q over Q
    var t4 = HLP.multPowMod(this.QoQ, msg[7], msg[5], msg[6], this.N)
dump("test5\n");
    //if (!HLP.ZKP(7, msg[6], t3, t4)) return this.abort()

    this.computeR()

    // zero-knowledge proof that R
    // was generated according to the protocol
    var r7 = HLP.randomExponent()
    var tmp2 = BigInt.powMod(this.QoQ, r7, this.N)
    var cR = HLP.smpHash(8, BigInt.powMod(this.G, r7, this.N), tmp2)
    var d7 = this.computeD(r7, this.a3, cR)

    //send = HLP.packINT(3) + HLP.packMPIs([ this.r, cR, d7 ])
    //send = HLP.packTLV(5, send)

    var rab = this.computeRab(msg[5])
    var trust = !!BigInt.equals(rab, BigInt.divMod(msg[0], this.p, this.N))
    dump(trust?"YES\n":"NO\n");

    var send = "";
    send += "r="+BigInt.bigInt2str(this.r, 16)+CONST.LN;
    send += "cR="+BigInt.bigInt2str(this.cR, 16)+CONST.LN;
    send += "d7="+BigInt.bigInt2str(d7, 16);

    this.smpSendEmail(send, 4);

    this.init();
  },

  answerMsg4 : function(cells) {
    
    this.g3ao = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g3ao"), 16, 0);
    this.QoQ = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_QoQ"), 16, 0);
    this.PoP = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_PoP"), 16, 0);
    
    var _r = BigInt.str2bigInt(cells["r"], 16, 0);
    var _cR = BigInt.str2bigInt(cells["cR"], 16, 0);
    var _d7 = BigInt.str2bigInt(cells["d7"], 16, 0);

    var msg = [_r, _cR, _d7];
    if (!HLP.checkGroup(msg[0], this.N_MINUS_2)) return this.abort()

    // verify znp of cR
    var t3 = HLP.multPowMod(this.G, msg[2], this.g3ao, msg[1], this.N)
    var t4 = HLP.multPowMod(this.QoQ, msg[2], msg[0], msg[1], this.N)
    if (!HLP.ZKP(8, msg[1], t3, t4)) return this.abort()

    var rab = this.computeRab(msg[0])
    var trust = !!BigInt.equals(rab, this.PoP)
    dump(trust?"YES\n":"NO\n");

    this.init();
  },

  //START
  initialize : function(question) 
  {
    question = CryptoJS.enc.Latin1.parse(question).toString(CryptoJS.enc.Utf8);

    this.makeG2s();

    var r2 = HLP.randomExponent();
    var r3 = HLP.randomExponent();
    this.c2 = this.computeC(1, r2);
    this.c3 = this.computeC(2, r3);
    this.d2 = this.computeD(r2, this.a2, this.c2);
    this.d3 = this.computeD(r3, this.a3, this.c3);

    EnigmailPrefs.setPref(this.fromEmail+"_mill_a2", BigInt.bigInt2str(this.a2, 16));
    EnigmailPrefs.setPref(this.fromEmail+"_mill_a3", BigInt.bigInt2str(this.a3, 16));

    var send = "";
    
    send += "question="+question+CONST.LN;
    send += "g2a="+BigInt.bigInt2str(this.g2a, 16)+"#\n";
    send += "c2="+BigInt.bigInt2str(this.c2, 16)+CONST.LN;
    send += "d2="+BigInt.bigInt2str(this.d2, 16)+CONST.LN;
    send += "g3a="+BigInt.bigInt2str(this.g3a, 16)+CONST.LN;
    send += "c3="+BigInt.bigInt2str(this.c3, 16)+CONST.LN;
    send += "d3="+BigInt.bigInt2str(this.d3, 16);

    this.makeSecret(true, "baum");
    this.smpSendEmail(send, 1);
    dump(send.length+"\n");
  },
  smpSendEmail : function(data, status) 
  {
    var textBegin = "-----BEGIN MILL MESSAGE-----";
    var textEnd = "-----END MILL MESSAGE-----";

    var body = textBegin+CONST.LN;
    body += "Version: 1.0"+CONST.LN;
    body += "Status: "+status+CONST.LN;
    body += "Data:#";
    body += data;
    body += CONST.LN;
    body += "ownfinger: " + this.tofinger + CONST.LN;
    body += "tofinger: " + this.ownfinger + CONST.LN;
    body += textEnd;
    dump(body+"\n");
    //"skjdstzn@gmx.de"
    this.sendMail(this.tomail, "million test", body);
  },

  abort : function() {
    dump("FAILED WRONG FORMAT\n");

    this.init();
  }, 

  loadG2s : function() {

  },

  //================================
  makeG2s : function () {
    this.a2 = HLP.randomExponent();
    this.a3 = HLP.randomExponent();
    this.g2a = BigInt.powMod(this.G, this.a2, this.N);
    this.g3a = BigInt.powMod(this.G, this.a3, this.N);
    if (!HLP.checkGroup(this.g2a, this.N_MINUS_2) || !HLP.checkGroup(this.g3a, this.N_MINUS_2)) this.makeG2s();
  },

  parseEmail : function(toParse) {
    var em = toParse.substr(toParse.lastIndexOf("<"));
    em = em.substr(1, em.length-2);
    return em;
  },

  hasReadSecret : function(secret) {
    dump("secret : " + secret + "\n");

    var state = EnigmailPrefs.getPref(this.fromEmail+"_mill_state");

    if (state == "1") {
        this.g2 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g2"), 16, 0);
        this.g3 = BigInt.str2bigInt(EnigmailPrefs.getPref(this.fromEmail+"_mill_g3"), 16, 0);
        this.makeSecret(true, secret);
        //======================================

        var r4 = HLP.randomExponent();
        this.computePQ(r4);

        // zero-knowledge proof that P & Q
        // were generated according to the protocol
        var r5 = HLP.randomExponent();
        var r6 = HLP.randomExponent();
        var tmp = HLP.multPowMod(this.G, r5, this.g2, r6, this.N);
        var cP = HLP.smpHash(5, BigInt.powMod(this.g3, r5, this.N), tmp);
        var d5 = this.computeD(r5, r4, cP);
        var d6 = this.computeD(r6, this.secret, cP);

        var send = "";
        send += "g2a="+BigInt.bigInt2str(this.g2a, 16)+CONST.LN;
        send += "c2="+BigInt.bigInt2str(this.c2, 16)+CONST.LN;
        send += "d2="+BigInt.bigInt2str(this.d2, 16)+CONST.LN;
        send += "g3a="+BigInt.bigInt2str(this.g3a, 16)+CONST.LN;
        send += "c3="+BigInt.bigInt2str(this.c3, 16)+CONST.LN;
        send += "d3="+BigInt.bigInt2str(this.d3, 16)+CONST.LN;
        send += "p="+BigInt.bigInt2str(this.p, 16)+CONST.LN;
        send += "q="+BigInt.bigInt2str(this.q, 16)+CONST.LN;
        send += "cP="+BigInt.bigInt2str(cP, 16)+CONST.LN;
        send += "d5="+BigInt.bigInt2str(d5, 16)+CONST.LN;
        send += "d6="+BigInt.bigInt2str(d6, 16);

        this.smpSendEmail(send, 2);
    }else if (state == "0") {
        this.makeSecret(false, secret);
        EnigmailMillion.initialize("quest");
    }
  },

  readSecret : function() {
    dump("open\n");
    EnigmailWindows.openWin("enigmail:MillionSecret", "chrome://enigmail/content/enigmailMillionSecret.xul", "resizable,centerscreen");
    dump("open2\n");
  },

  makeSecret : function (our, secret) {
    var sha256 = CryptoJS.algo.SHA256.create()
    sha256.update(CryptoJS.enc.Latin1.parse(HLP.packBytes(1, 1)))
    sha256.update(CryptoJS.enc.Hex.parse(our ? this.ownfinger : this.tofinger))
    sha256.update(CryptoJS.enc.Hex.parse(our ? this.tofinger : this.ownfinger))
    //sha256.update(CryptoJS.enc.Latin1.parse(this.ssid))
    sha256.update(CryptoJS.enc.Latin1.parse(secret))
    var hash = sha256.finalize()
    this.secret = HLP.bits2bigInt(hash.toString(CryptoJS.enc.Latin1))

    dump("\nSECRET="+BigInt.bigInt2str(this.secret, 16)+"\n");
  },

  computeC : function (v, r) {
    return HLP.smpHash(v, BigInt.powMod(this.G, r, this.N));
  },

  computeD : function (r, a, c) {
    return BigInt.subMod(r, BigInt.multMod(a, c, this.Q), this.Q);
  },

  computeGs : function (_g2a, _g3a) {
    this.g2 = BigInt.powMod(_g2a, this.a2, this.N);
    this.g3 = BigInt.powMod(_g3a, this.a3, this.N);
  },

  computePQ : function (r) {
    this.p = BigInt.powMod(this.g3, r, this.N);
    this.q = HLP.multPowMod(this.G, r, this.g2, this.secret, this.N);
  },
  computeR : function () {
    this.r = BigInt.powMod(this.QoQ, this.a3, this.N);
  },
  computeRab : function (r) {
    return BigInt.powMod(r, this.a3, this.N)
  },

  sendMail : function(to, subject, msg) {
    let am = MailServices.accounts;

    let compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields);
    compFields.from = am.defaultAccount.email;
    compFields.to = to;
    compFields.subject = subject;
    compFields.body = msg+"\r\n";
    let msgComposeParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
    msgComposeParams.composeFields = compFields;
    //msgComposeParams.enablePgp = true;

    dump(compFields.body+"\n");

    /*let gMsgCompose = Components.classes["@mozilla.org/messengercompose/compose;1"].createInstance(Components.interfaces.nsIMsgCompose);
    let msgSend = Components.classes["@mozilla.org/messengercompose/send;1"].createInstance(Components.interfaces.nsIMsgSend);
    gMsgCompose.initialize(msgComposeParams);
    gMsgCompose.SendMsg(msgSend.nsMsgDeliverNow, am.defaultAccount.defaultIdentity, am.defaultAccount, null, null);*/

    var msgCompFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    var acctManager = Cc["@mozilla.org/messenger/account-manager;1"].createInstance(Ci.nsIMsgAccountManager);
    var msgCompSvc = Cc["@mozilla.org/messengercompose;1"].getService(Ci.nsIMsgComposeService);
    var msgCompParam = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    msgComposeParams.identity = acctManager.defaultAccount.defaultIdentity;
    msgComposeParams.type = Ci.nsIMsgCompType.New;
    msgComposeParams.format = Ci.nsIMsgCompFormat.Default;
    msgComposeParams.originalMsgURI = "";
    msgCompSvc.OpenComposeWindowWithParams("", msgComposeParams);
  },
  /*
    -----BEGIN MILL MESSAGE-----
    Version: 1.0
    Status: 0
    Data:
    g2a: 1
    g3a: 5
    -----END MILL MESSAGE-----

    -----BEGIN MILL MESSAGE-----#Version: 1.0#Status: 0#Data:#g2a: 1#g3a: 5#-----END MILL MESSAGE-----
  */

  trimText: function(plain)
  {
    var textBegin = "-----BEGIN MILL MESSAGE-----";
    var textEnd = "-----END MILL MESSAGE-----";
    var indexBegin = plain.indexOf(textBegin) + textBegin.length;
    var indexEnd = plain.indexOf(textEnd);
    return plain.substring(indexBegin,indexEnd);  
  }, 

  passText: function(plain)
  {
    var ret = [];
    plain = plain.split("#");
    for (var i in plain) {
      if (plain[i].trim() == "") 
        continue; 
      var cell = plain[i].split(":",2);
      if (cell.length < 2)
        cell = plain[i].split("=",2);
      if (cell.length == 2)
        ret[cell[0].trim()]=cell[1].trim();
      else
        dump("Error splitting : " + plain[i]);      
    };
    return ret;
  }
};

EnigmailMillion.init();