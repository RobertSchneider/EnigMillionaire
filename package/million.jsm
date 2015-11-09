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
    return;
  }

};
