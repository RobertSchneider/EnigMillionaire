/*global Components: false */
/*jshint -W097 */
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
 * Copyright (C) 2010 Patrick Brunschwig. All Rights Reserved.
 *
 * Contributor(s):
 *  Patrick Brunschwig <patrick@enigmail.net>
 *  Janosch Rux <rux@informatik.uni-luebeck.de>
 *  Fan Jiang <fanjiang@thoughtworks.com>
 *  Iván Pazmiño <iapazmino@thoughtworks.com>
 *  Ola Bini <obini@thoughtworks.com>
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

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailCommandLine"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm"); /*global XPCOMUtils: false */

const NS_ENIGCLINE_SERVICE_CID = Components.ID("{847b3ab1-7ab1-11d4-8f02-006008948af5}");
const NS_CLINE_SERVICE_CONTRACTID = "@mozilla.org/enigmail/cline-handler;1";

const nsICommandLineHandler = Ci.nsICommandLineHandler;
const nsIFactory = Ci.nsIFactory;
const nsISupports = Ci.nsISupports;

function Handler() {}

Handler.prototype = {
  classDescription: "Enigmail Key Management CommandLine Service",
  classID: NS_ENIGCLINE_SERVICE_CID,
  contractID: NS_CLINE_SERVICE_CONTRACTID,
  _xpcom_categories: [{
    category: "command-line-handler",
    entry: "m-cline-enigmail",
    service: false
  }],
  QueryInterface: XPCOMUtils.generateQI([nsICommandLineHandler, nsIFactory, nsISupports]),

  // nsICommandLineHandler
  handle: function(cmdLine) {
    if (cmdLine.handleFlag("pgpkeyman", false)) {
      cmdLine.preventDefault = true; // do not open main app window

      const wwatch = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
      wwatch.openWindow(null, "chrome://enigmail/content/enigmailKeyManager.xul", "_blank", "chrome,dialog=no,all", cmdLine);
    }
  },

  helpInfo: "  -pgpkeyman         Open the OpenPGP key management.\n",

  lockFactory: function(lock) {}
};

const EnigmailCommandLine = {
  Handler: Handler
};
