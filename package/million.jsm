/*global Components: false, dump: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailMillion"];



const EnigmailMillion = {
  /*
    -----BEGIN MILL MESSAGE-----
    Version: 1.0
    Staus: 1
    Data:
    g2a: 1
    g3a: 5
    -----END MILL MESSAGE-----
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
    plain = plain.split("\n");
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
  },

  messageHandleMILL: function(node) {
    var plain = node.textContent;
    dump("found mill plain : " + plain + "\n");
    var cells = this.passText(this.trimText(plain));

    var html = "<table> ";
    for (var i in cells) {
     html += "<tr bgcolor='#e2e3e7'><td>"+ i + "</td><td>" + cells[i] + "</td></tr>";
    };
    html += "</table>";
    node.innerHTML = html;
    return;
  }
};