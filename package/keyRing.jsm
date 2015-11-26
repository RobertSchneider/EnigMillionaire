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

var EXPORTED_SYMBOLS = ["EnigmailKeyRing"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://enigmail/core.jsm"); /*global EnigmailCore: false */
Cu.import("resource://enigmail/log.jsm"); /*global EnigmailLog: false */
Cu.import("resource://enigmail/execution.jsm"); /*global EnigmailExecution: false */
Cu.import("resource://enigmail/locale.jsm"); /*global EnigmailLocale: false */
Cu.import("resource://enigmail/files.jsm"); /*global EnigmailFiles: false */
Cu.import("resource://enigmail/gpg.jsm"); /*global EnigmailGpg: false */
Cu.import("resource://enigmail/trust.jsm"); /*global EnigmailTrust: false */
Cu.import("resource://enigmail/armor.jsm"); /*global EnigmailArmor: false */
Cu.import("resource://enigmail/dialog.jsm"); /*global EnigmailDialog: false */
Cu.import("resource://enigmail/os.jsm"); /*global EnigmailOS: false */
Cu.import("resource://enigmail/time.jsm"); /*global EnigmailTime: false */
Cu.import("resource://enigmail/data.jsm"); /*global EnigmailData: false */
Cu.import("resource://enigmail/windows.jsm"); /*global EnigmailWindows: false */
Cu.import("resource://enigmail/subprocess.jsm"); /*global subprocess: false */
Cu.import("resource://enigmail/funcs.jsm"); /* global EnigmailFuncs: false */

const nsIEnigmail = Ci.nsIEnigmail;

const NS_RDONLY = 0x01;
const NS_WRONLY = 0x02;
const NS_CREATE_FILE = 0x08;
const NS_TRUNCATE = 0x20;
const DEFAULT_FILE_PERMS = 0x180; // equals 0600

const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID =
  "@mozilla.org/network/file-output-stream;1";

// field ID's of key list (as described in the doc/DETAILS file in the GnuPG distribution)
const ENTRY_ID = 0;
const KEY_TRUST_ID = 1;
const KEY_SIZE_ID = 2;
const KEY_ALGO_ID = 3;
const KEY_ID = 4;
const CREATED_ID = 5;
const EXPIRY_ID = 6;
const UID_ID = 7;
const OWNERTRUST_ID = 8;
const USERID_ID = 9;
const SIG_TYPE_ID = 10;
const KEY_USE_FOR_ID = 11;

const UNKNOWN_SIGNATURE = "[User ID not found]";

const KEYTYPE_DSA = 1;
const KEYTYPE_RSA = 2;

let userIdList = null;
let secretKeyList = null;
let keygenProcess = null;
let gKeyListObj = null;

/*

  This module operates with a Key Store (array) containing objects with the following properties:

  * keyList [Array] of |KeyObject|:
    - keyId           - 16 digits (8-byte) public key ID (/not/ preceeded with 0x)
    - userId          - main user ID
    - fpr             - fingerprint
    - expiry          - Expiry date as printable string
    - expiryTime      - Expiry time as seconds after 01/01/1970
    - created         - Key creation date as printable string
    - keyTrust        - key trust code as provided by GnuPG
    - keyUseFor       - key usage type as provided by GnuPG
    - ownerTrust      - owner trust as provided by GnuPG
    - photoAvailable  - [Boolean] true if photo is available
    - secretAvailable - [Boolean] true if secret key is available
    - algorithm       - public key algorithm type
    - keySize         - size of public key
    - type            - "pub" or "grp"
    - SubUserIds  - [Array]:
                      * userId     - additional User ID
                      * keyTrust   - trust level of user ID
                      * type       - one of "uid" (regular user ID), "uat" (photo)
                      * uatNum     - photo number (starting with 0 for each key)
    - subKeys     - [Array]:
                      * keyId      - subkey ID (16 digits (8-byte))
                      * expiry     - Expiry date as printable string
                      * expiryTime - Expiry time as seconds after 01/01/1970
                      * created    - Key creation date as printable string
                      * keyTrust   - key trust code as provided by GnuPG
                      * keyUseFor  - key usage type as provided by GnuPG
                      * algorithm  - subkey algorithm type
                      * keySize    - subkey size
                      * type       -  "sub"

    - signatures  - [Array]: list of signature objects
                      * userId
                      * uidLabel
                      * created
                      * fpr
                      * sigList: Array of object: { userId, created, signerKeyId, sigType, sigKnown }

  * keySortList [Array]:  used for quickly sorting the keys
    - user ID (in lower case)
    - key ID
  * trustModel: [String]. One of:
            - p: pgp/classical
            - t: always trust
            - a: auto (:0) (default, currently pgp/classical)
*/

const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

var EnigmailKeyRing = {

  /**
   * Get the complete list of all public keys, optionally sorted by a column
   *
   * @param  win           - optional |object| holding the parent window for displaying error messages
   * @param  sortColumn    - optional |string| containing the column name for sorting. One of:
   *                            userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry
   * @param  sortDirection - |number| 1 = ascending / -1 = descending
   *
   * @return keyListObj    - |object| { keyList, keySortList } (see above)
   */
  getAllKeys: function(win, sortColumn, sortDirection) {
    if (gKeyListObj.keySortList.length === 0) {
      let a = loadKeyList(win, false, gKeyListObj, sortColumn, sortDirection);
    }
    else {
      if (sortColumn) {
        gKeyListObj.keySortList.sort(getSortFunction(sortColumn.toLowerCase(), gKeyListObj, sortDirection));
      }
    }

    return gKeyListObj;
  },

  /**
   * get a list of all (valid, usable) keys that have a secret key
   *
   * @param Boolean onlyValidKeys: if true, only filter valid usable keys
   *
   * @return Array of KeyObjects containing the found keys (sorted by userId)
   **/

  getAllSecretKeys: function(onlyValidKeys = false) {
    this.getAllKeys(); // ensure keylist is loaded;

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    if (!onlyValidKeys) {
      for each(let key in gKeyListObj.keyList) {
        if (key.secretAvailable) res.push(key);
      }
    }
    else {
      for each(let key in gKeyListObj.keyList) {
        if (key.secretAvailable && key.keyUseFor.search(/D/) < 0) {
          // key is not disabled and _usable_ for encryption signing and certification
          if (key.keyUseFor.search(/E/) >= 0 &&
            key.keyUseFor.search(/S/) >= 0 &&
            key.keyUseFor.search(/C/) >= 0) {
            res.push(key);
          }
        }
      }
    }

    res.sort(function(a, b) {
      return a.userId == b.userId ? (a.keyId < b.keyId ? -1 : 1) : (a.userId.toLowerCase() < b.userId.toLowerCase() ? -1 : 1);
    });

    return res;
  },


  /**
   * get 1st key object that matches a given key ID or subkey ID
   *
   * @param keyId - String: key Id with 16 characters (preferred) or 8 characters),
   *                        or fingerprint (40 or 32 characters).
   *                        Optionally preceeded with "0x"
   *
   * @return Object - found KeyObject or null if key not found
   */
  getKeyById: function(keyId) {
    EnigmailLog.DEBUG("keyRing.jsm: getKeyById: " + keyId + "\n");
    let s;

    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2);
    }

    switch (keyId.length) {
      case 16:
        s = new RegExp("^" + keyId + "$", "i");
        break;
      case 40:
      case 32:
        if (keyId.search(/^[0-9a-f]+$/i) === 0) {
          return this.getKeyByFingerprint(keyId);
        }
        else {
          EnigmailLog.ERROR("keyRing.jsm: getKeyById: invalid keyId '" + keyId + "'\n");
          throw Components.results.NS_ERROR_FAILURE;
        }
        break;
      default:
        s = new RegExp(keyId + "$", "i");
    }

    this.getAllKeys(); // ensure keylist is loaded;

    for (let i in gKeyListObj.keyList) {
      if (gKeyListObj.keyList[i].keyId.search(s) >= 0) {
        return gKeyListObj.keyList[i];
      }
      for (let j in gKeyListObj.keyList[i].subKeys) {
        if (gKeyListObj.keyList[i].subKeys[j].keyId.search(s) >= 0) {
          return gKeyListObj.keyList[i];
        }
      }
    }

    return null;
  },

  getSignes : function() {
    let args = EnigmailGpg.getStandardArgs(true);
    args = args.concat(["--with-colons", "--list-sigs", "--fixed-list-mode"]);
    
    var statusFlagsObj = {};
    statusFlagsObj.value = 0;

    const cmdErrorMsgObj = {};
    var exitCodeObj = {};
    let listText = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, statusFlagsObj, {}, cmdErrorMsgObj);

    return listText;
},

  /**
   * get 1st key object that matches a given fingerprint
   *
   * @param keyId - String: key Id (8 or 16 characters), optionally preceeded with "0x"
   *
   * @return Object - found KeyObject or null if key not found
   */
  getKeyByFingerprint: function(fpr) {
    if (fpr.search(/^0x/) === 0) {
      fpr = fpr.substr(2);
    }

    this.getAllKeys(); // ensure keylist is loaded;

    let s = new RegExp("^" + fpr + "$", "i");

    for (let i in gKeyListObj.keyList) {
      if (gKeyListObj.keyList[i].fpr.search(s) === 0) {
        return gKeyListObj.keyList[i];
      }
    }

    return null;
  },

  /**
   * get all key objects that match a given user ID
   *
   * @param searchTerm   - String: a regular expression to match against all UIDs of the keys.
   *                               The search is always performed case-insensitively
   * @param onlyValidUid - Boolean: if true (default), invalid (e.g. revoked) UIDs are not matched
   *
   * @return Array of KeyObjects with the found keys
   */
  getKeysByUserId: function(searchTerm, onlyValidUid = true) {
    let s = new RegExp(searchTerm, "i");

    let res = [];

    this.getAllKeys(); // ensure keylist is loaded;

    for (let i in gKeyListObj.keyList) {
      let k = gKeyListObj.keyList[i];

      if (k.userId.search(s) >= 0) {
        res.push(gKeyListObj.keyList[i]);
      }
      else {
        for (let j in k.SubUserIds) {
          if (k.SubUserIds[j].type === "uid" && k.SubUserIds[j].userId.search(s) >= 0) {
            if (!onlyValidUid || (!EnigmailTrust.isInvalid(k.SubUserIds[j].keyTrust))) {
              res.push(k);
              continue;
            }
          }
        }
      }
    }

    return res;
  },

  /**
   * get a list of keys for a given set of (sub-) key IDs
   *
   * @param keyIdList: Array of key IDs
                       OR String, with space-separated list of key IDs
   */
  getKeyListById: function(keyIdList) {
    let keyArr;
    if (typeof keyIdList === "string") {
      keyArr = keyIdList.split(/ +/);
    }
    else {
      keyArr = keyIdList;
    }

    let ret = [];
    for (let i in keyArr) {
      let r = this.getKeyById(keyArr[i]);
      if (r) ret.push(r);
    }

    return ret;
  },

  importKeyFromFile: function(inputFile, errorMsgObj, importedKeysObj) {
    var command = EnigmailGpg.agentPath;
    var args = EnigmailGpg.getStandardArgs(true);
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.importKeyFromFile: fileName=" + inputFile.path + "\n");
    importedKeysObj.value = "";

    var fileName = EnigmailFiles.getEscapedFilename((inputFile.QueryInterface(Ci.nsIFile)).path);

    args.push("--import");
    args.push(fileName);

    var statusFlagsObj = {};
    var statusMsgObj = {};
    var exitCodeObj = {};

    var output = EnigmailExecution.execCmd(command, args, "", exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);
    EnigmailLog.ERROR("keyRing.jsm: EnigmailKeyRing.importKeyFromFile: error=" + errorMsgObj.value + "\n");

    var statusMsg = statusMsgObj.value;

    var keyList = [];

    if (exitCodeObj.value === 0) {
      // Normal
      EnigmailKeyRing.clearCache();

      var statusLines = statusMsg.split(/\r?\n/);

      // Discard last null string, if any

      for (var j = 0; j < statusLines.length; j++) {
        var matches = statusLines[j].match(/IMPORT_OK ([0-9]+) (\w+)/);
        if (matches && (matches.length > 2)) {
          if (typeof(keyList[matches[2]]) != "undefined") {
            keyList[matches[2]] |= Number(matches[1]);
          }
          else
            keyList[matches[2]] = Number(matches[1]);

          EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.importKeyFromFile: imported " + matches[2] + ":" + matches[1] + "\n");
        }
      }

      for (j in keyList) {
        importedKeysObj.value += j + ":" + keyList[j] + ";";
      }
    }

    return exitCodeObj.value;
  },

  /**
   * Get groups defined in gpg.conf in the same structure as KeyObject
   *
   * @return Array of KeyObject, with type = "grp"
   */
  getGroups: function() {
    let groups = EnigmailGpg.getGpgGroups();

    let r = [];
    for (var i = 0; i < groups.length; i++) {

      let keyObj = new KeyObject(["grp"]);
      keyObj.keyTrust = "g";
      keyObj.userId = EnigmailData.convertGpgToUnicode(groups[i].alias).replace(/\\e3A/g, ":");
      keyObj.keyId = keyObj.userId;
      var grpMembers = EnigmailData.convertGpgToUnicode(groups[i].keylist).replace(/\\e3A/g, ":").split(/[,;]/);
      for (var grpIdx = 0; grpIdx < grpMembers.length; grpIdx++) {
        keyObj.SubUserIds.push({
          userId: grpMembers[grpIdx],
          keyTrust: "q"
        });
      }
      r.push(keyObj);
    }

    return r;
  },

  /**
   * empty the key cache, such that it will get loaded next time it is accessed
   *
   * no input or return values
   */
  clearCache: function() {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.clearCache\n");
    gKeyListObj = {
      keyList: [],
      keySortList: []
    };

    userIdList = null;
    secretKeyList = null;
  },


  /**
   * Get a list of UserIds for a give key.
   * Only the Only UIDs with highest trust level are returned.
   *
   * @param  String  keyId   key, optionally preceeded with 0x
   *
   * @return Array of String: list of UserIds
   */
  getValidUids: function(keyId) {
    let r = [];
    let keyObj = this.getKeyById(keyId);

    if (keyObj) {
      const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
      let hideInvalidUid = true;
      let maxTrustLevel = TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust);

      if (EnigmailTrust.isInvalid(keyObj.keyTrust)) {
        // pub key not valid (anymore)-> display all UID's
        hideInvalidUid = false;
      }

      r.push(keyObj.userId); // main user ID is valid by definition (or key is not valid)

      for (let i in keyObj.SubUserIds) {
        if (keyObj.SubUserIds[i].type !== "uat") {
          if (hideInvalidUid) {
            let thisTrust = TRUSTLEVELS_SORTED.indexOf(keyObj.SubUserIds[i].keyTrust);
            if (thisTrust > maxTrustLevel) {
              r = [keyObj.SubUserIds[i].userId];
              maxTrustLevel = thisTrust;
            }
            else if (thisTrust === maxTrustLevel) {
              r.push(keyObj.SubUserIds[i].userId);
            }
            // else do not add uid
          }
          else if (!EnigmailTrust.isInvalid(keyObj.SubUserIds[i].keyTrust) || !hideInvalidUid) {
            // UID valid  OR  key not valid, but invalid keys allowed
            r.push(keyObj.SubUserIds[i].userId);
          }
        }
      }
    }

    return r;
  },

  /**
   * Export public and possibly secret key(s) to a file
   *
   * @param includeSecretKey  Boolean  - if true, secret keys are exported
   * @param userId            String   - space or comma separated list of keys to export. Specification by
   *                                     key ID, fingerprint, or userId
   * @param outputFile        String or nsIFile - output file name or Object - or NULL
   * @param exitCodeObj       Object   - o.value will contain exit code
   * @param errorMsgObj       Object   - o.value will contain error message from GnuPG
   *
   * @return String - if outputFile is NULL, the key block data; "" if a file is written
   */
  extractKey: function(includeSecretKey, userId, outputFile, exitCodeObj, errorMsgObj) {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.extractKey: " + userId + "\n");
    const args = EnigmailGpg.getStandardArgs(true).
    concat(["-a", "--export"]).
    concat(userId.split(/[ ,\t]+/));

    const cmdErrorMsgObj = {};
    let keyBlock = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, {}, {}, cmdErrorMsgObj);

    if ((exitCodeObj.value === 0) && !keyBlock) {
      exitCodeObj.value = -1;
    }

    if (exitCodeObj.value !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("failKeyExtract");

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    if (includeSecretKey) {
      const secretArgs = EnigmailGpg.getStandardArgs(true).
      concat(["-a", "--export-secret-keys"]).
      concat(userId.split(/[ ,\t]+/));

      const secKeyBlock = EnigmailExecution.execCmd(EnigmailGpg.agentPath, secretArgs, "", exitCodeObj, {}, {}, cmdErrorMsgObj);

      if ((exitCodeObj.value === 0) && !secKeyBlock) {
        exitCodeObj.value = -1;
      }

      if (exitCodeObj.value !== 0) {
        errorMsgObj.value = EnigmailLocale.getString("failKeyExtract");

        if (cmdErrorMsgObj.value) {
          errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, secretArgs);
          errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
        }

        return "";
      }

      if (keyBlock.substr(-1, 1).search(/[\r\n]/) < 0) {
        keyBlock += "\n";
      }
      keyBlock += secKeyBlock;
    }

    if (outputFile) {
      if (!EnigmailFiles.writeFileContents(outputFile, keyBlock, DEFAULT_FILE_PERMS)) {
        exitCodeObj.value = -1;
        errorMsgObj.value = EnigmailLocale.getString("fileWriteFailed", [outputFile]);
      }
      return "";
    }
    return keyBlock;
  },

  /**
   * import key from provided key data
   *
   * @param parent        nsIWindow
   * @param isInteractive Boolean  - if true, display confirmation dialog
   * @param keyBLock      String   - data containing key
   * @param keyId         String   - key ID expected to import (no meaning)
   * @param errorMsgObj   Object   - o.value will contain error message from GnuPG
   *
   * @return Integer -  exit code:
   *      ExitCode == 0  => success
   *      ExitCode > 0   => error
   *      ExitCode == -1 => Cancelled by user
   */
  importKey: function(parent, isInteractive, keyBlock, keyId, errorMsgObj) {
    EnigmailLog.DEBUG("keyRing.jsm: EnigmailKeyRing.importKey: id=" + keyId + ", " + isInteractive + "\n");

    const beginIndexObj = {};
    const endIndexObj = {};
    const blockType = EnigmailArmor.locateArmoredBlock(keyBlock, 0, "", beginIndexObj, endIndexObj, {});
    if (!blockType) {
      errorMsgObj.value = EnigmailLocale.getString("noPGPblock");
      return 1;
    }

    if (blockType != "PUBLIC KEY BLOCK") {
      errorMsgObj.value = EnigmailLocale.getString("notFirstBlock");
      return 1;
    }

    const pgpBlock = keyBlock.substr(beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1);

    if (isInteractive) {
      if (!EnigmailDialog.confirmDlg(parent, EnigmailLocale.getString("importKeyConfirm"), EnigmailLocale.getString("keyMan.button.import"))) {
        errorMsgObj.value = EnigmailLocale.getString("failCancel");
        return -1;
      }
    }

    const args = EnigmailGpg.getStandardArgs(true).
    concat(["--import"]);

    const exitCodeObj = {};
    const statusMsgObj = {};

    EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, pgpBlock, exitCodeObj, {}, statusMsgObj, errorMsgObj);

    const statusMsg = statusMsgObj.value;

    if (exitCodeObj.value === 0) {
      // Normal return
      EnigmailKeyRing.clearCache();
      if (statusMsg && (statusMsg.search("IMPORTED ") > -1)) {
        const matches = statusMsg.match(/(^|\n)IMPORTED (\w{8})(\w{8})/);
        if (matches && (matches.length > 3)) {
          EnigmailLog.DEBUG("enigmail.js: Enigmail.importKey: IMPORTED 0x" + matches[3] + "\n");
        }
      }
    }

    return exitCodeObj.value;
  },

  /**
   * Extract a photo ID from a key, store it as file and return the file object.
   * @keyId:       String  - Key ID
   * @photoNumber: Number  - number of the photo on the key, starting with 0
   * @exitCodeObj: Object  - value holds exitCode (0 = success)
   * @errorMsgObj: Object  - value holds errorMsg
   *
   * @return: nsIFile object or null in case no data / error.
   */
  getPhotoFile: function(keyId, photoNumber, exitCodeObj, errorMsgObj) {
    EnigmailLog.DEBUG("keyRing.js: EnigmailKeyRing.getPhotoFile, keyId=" + keyId + " photoNumber=" + photoNumber + "\n");

    const args = EnigmailGpg.getStandardArgs().
    concat(["--no-secmem-warning", "--no-verbose", "--no-auto-check-trustdb",
      "--batch", "--no-tty", "--status-fd", "1", "--attribute-fd", "2",
      "--fixed-list-mode", "--list-keys", keyId
    ]);

    const photoDataObj = {};
    const outputTxt = EnigmailExecution.simpleExecCmd(EnigmailGpg.agentPath, args, exitCodeObj, photoDataObj);

    if (!outputTxt) {
      exitCodeObj.value = -1;
      return null;
    }

    if (EnigmailOS.isDosLike() && EnigmailGpg.getGpgFeature("windows-photoid-bug")) {
      // workaround for error in gpg
      photoDataObj.value = photoDataObj.value.replace(/\r\n/g, "\n");
    }

    // [GNUPG:] ATTRIBUTE A053069284158FC1E6770BDB57C9EB602B0717E2 2985
    let foundPicture = -1;
    let skipData = 0;
    let imgSize = -1;
    const statusLines = outputTxt.split(/[\n\r+]/);

    for (let i = 0; i < statusLines.length; i++) {
      const matches = statusLines[i].match(/\[GNUPG:\] ATTRIBUTE ([A-F\d]+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)/);
      if (matches && matches[3] == "1") {
        // attribute is an image
        foundPicture++;
        if (foundPicture === photoNumber) {
          imgSize = Number(matches[2]);
          break;
        }
        else {
          skipData += Number(matches[2]);
        }
      }
    }

    if (foundPicture >= 0 && foundPicture === photoNumber) {
      const pictureData = photoDataObj.value.substr(16 + skipData, imgSize);
      if (!pictureData.length) {
        return null;
      }

      try {
        const flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;
        const picFile = EnigmailFiles.getTempDirObj();

        picFile.append(keyId + ".jpg");
        picFile.createUnique(picFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);

        const fileStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
        fileStream.init(picFile, flags, DEFAULT_FILE_PERMS, 0);
        if (fileStream.write(pictureData, pictureData.length) !== pictureData.length) {
          throw Components.results.NS_ERROR_FAILURE;
        }

        fileStream.flush();
        fileStream.close();
        return picFile;

      }
      catch (ex) {
        exitCodeObj.value = -1;
        return null;
      }
    }
    return null;
  },

  isGeneratingKey: function() {
    return keygenProcess !== null;
  },

  /**
   * Generate a new key pair with GnuPG
   *
   * @name:       String     - name part of UID
   * @comment:    String     - comment part of UID (brackets are added)
   * @comment:    String     - email part of UID (<> will be added)
   * @expiryDate: Number     - Unix timestamp of key expiry date; 0 if no expiry
   * @keyLength:  Number     - size of key in bytes (e.g 4096)
   * @keyType:    Number     - 1 = DSA / 2 = RSA
   * @passphrase: String     - password; null if no password
   * @listener:   Object     - {
   *                             function onDataAvailable(data) {...},
   *                             function onStopRequest(exitCode) {...}
   *                           }
   *
   * @return: handle to process
   */
  generateKey: function(name, comment, email, expiryDate, keyLength, keyType,
    passphrase, listener) {
    EnigmailLog.WRITE("keyRing.jsm: generateKey:\n");

    if (EnigmailKeyRing.isGeneratingKey()) {
      // key generation already ongoing
      throw Components.results.NS_ERROR_FAILURE;
    }

    const args = EnigmailGpg.getStandardArgs(true).
    concat(["--gen-key"]);

    EnigmailLog.CONSOLE(EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args));

    let inputData = "%echo Generating key\nKey-Type: ";

    switch (keyType) {
      case KEYTYPE_DSA:
        inputData += "DSA\nKey-Length: " + keyLength + "\nSubkey-Type: 16\nSubkey-Length: ";
        break;
      case KEYTYPE_RSA:
        inputData += "RSA\nKey-Usage: sign,auth\nKey-Length: " + keyLength;
        inputData += "\nSubkey-Type: RSA\nSubkey-Usage: encrypt\nSubkey-Length: ";
        break;
      default:
        return null;
    }

    inputData += keyLength + "\n";
    if (name.replace(/ /g, "").length) {
      inputData += "Name-Real: " + name + "\n";
    }
    if (comment && comment.replace(/ /g, "").length) {
      inputData += "Name-Comment: " + comment + "\n";
    }
    inputData += "Name-Email: " + email + "\n";
    inputData += "Expire-Date: " + String(expiryDate) + "\n";

    EnigmailLog.CONSOLE(inputData + " \n");

    if (passphrase.length) {
      inputData += "Passphrase: " + passphrase + "\n";
    }

    inputData += "%commit\n%echo done\n";

    let proc = null;

    try {
      proc = subprocess.call({
        command: EnigmailGpg.agentPath,
        arguments: args,
        environment: EnigmailCore.getEnvList(),
        charset: null,
        stdin: function(pipe) {
          pipe.write(inputData);
          pipe.close();
        },
        stderr: function(data) {
          listener.onDataAvailable(data);
        },
        done: function(result) {
          keygenProcess = null;
          try {
            if (result.exitCode === 0) {
              EnigmailKeyRing.clearCache();
            }
            listener.onStopRequest(result.exitCode);
          }
          catch (ex) {}
        },
        mergeStderr: false
      });
    }
    catch (ex) {
      EnigmailLog.ERROR("keyRing.jsm: generateKey: subprocess.call failed with '" + ex.toString() + "'\n");
      throw ex;
    }

    keygenProcess = proc;

    EnigmailLog.DEBUG("keyRing.jsm: generateKey: subprocess = " + proc + "\n");

    return proc;
  },

  /**
   * try to find valid key for encryption to passed email address
   *
   * @param details if not null returns error in details.msg
   *
   * @return: found key ID (without leading "0x") or null
   */
  getValidKeyForRecipient: function(emailAddr, minTrustLevelIndex, details) {
    EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient(): emailAddr=\"" + emailAddr + "\"\n");
    const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();
    const fullTrustIndex = TRUSTLEVELS_SORTED.indexOf("f");

    emailAddr = emailAddr.toLowerCase();
    var embeddedEmailAddr = "<" + emailAddr + ">";

    // note: we can't take just the first matched because we might have faked keys as duplicates
    var foundKeyId = null;
    var foundTrustLevel = null;
    var foundKeyTrustIndex = null;

    let k = this.getAllKeys(null, "validity", -1);
    let keyList = k.keyList;
    let keySortList = k.keySortList;

    // **** LOOP to check against each key
    // - note: we have sorted the keys according to validity
    //         to abort the loop as soon as we reach keys that are not valid enough
    for (var idx = 0; idx < keySortList.length; idx++) {
      var keyObj = keyList[keySortList[idx].keyNum];
      var keyTrust = keyObj.keyTrust;
      var keyTrustIndex = TRUSTLEVELS_SORTED.indexOf(keyTrust);
      //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  check key " + keyObj.keyId + "\n");

      // key trust (our sort criterion) too low?
      // => *** regular END of the loop
      if (keyTrustIndex < minTrustLevelIndex) {
        if (!foundKeyId) {
          if (details) {
            details.msg = "ProblemNoKey";
          }
          let msg = "no key with enough trust level for '" + emailAddr + "' found";
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg + "\n");
        }
        return foundKeyId; // **** regular END OF LOOP (return NULL or found single key)
      }

      // key valid for encryption?
      if (keyObj.keyUseFor.indexOf("E") < 0) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (not provided for encryption)\n");
        continue; // not valid for encryption => **** CONTINUE the LOOP
      }
      // key disabled?
      if (keyObj.keyUseFor.indexOf("D") >= 0) {
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  skip key " + keyObj.keyId + " (disabled)\n");
        continue; // disabled => **** CONTINUE the LOOP
      }

      // check against the user ID
      var userId = keyObj.userId.toLowerCase();
      if (userId && (userId == emailAddr || userId.indexOf(embeddedEmailAddr) >= 0)) {
        if (keyTrustIndex < minTrustLevelIndex) {
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching key=" + keyObj.keyId + " found but not enough trust\n");
        }
        else {
          // key with enough trust level found
          EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  key=" + keyObj.keyId + " keyTrust=\"" + keyTrust + "\" found\n");

          // immediately return if a fully or ultimately trusted key is found
          // (faked keys should not be an issue here, so we don't have to check other keys)
          if (keyTrustIndex >= fullTrustIndex) {
            return keyObj.keyId;
          }

          if (foundKeyId != keyObj.keyId) {
            // new matching key found (note: might find same key via subkeys)
            if (foundKeyId) {
              // different matching keys found
              if (foundKeyTrustIndex > keyTrustIndex) {
                return foundKeyId; // OK, previously found key has higher trust level
              }
              // error because we have two keys with same trust level
              // => let the user decide (to prevent from using faked keys with default trust level)
              if (details) {
                details.msg = "ProblemMultipleKeys";
              }
              let msg = "multiple matching keys with same trust level found for '" + emailAddr + "' ";
              EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg +
                " trustLevel=\"" + keyTrust + "\" (0x" + foundKeyId + " and 0x" + keyObj.keyId + ")\n");
              return null;
            }
            // save found key to compare with other matching keys (handling of faked keys)
            foundKeyId = keyObj.keyId;
            foundKeyTrustIndex = keyTrustIndex;
          }
          continue; // matching key found (again) => **** CONTINUE the LOOP (don't check Sub-UserIDs)
        }
      }

      // check against the sub user ID
      // (if we are here, the primary user ID didn't match)
      // - Note: sub user IDs have NO owner trust
      for (var subUidIdx = 0; subUidIdx < keyObj.SubUserIds.length; subUidIdx++) {
        var subUidObj = keyObj.SubUserIds[subUidIdx];
        var subUserId = subUidObj.userId.toLowerCase();
        var subUidTrust = subUidObj.keyTrust;
        var subUidTrustIndex = TRUSTLEVELS_SORTED.indexOf(subUidTrust);
        //EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  check subUid " + subUidObj.keyId + "\n");

        if (subUserId && (subUserId == emailAddr || subUserId.indexOf(embeddedEmailAddr) >= 0)) {
          if (subUidTrustIndex < minTrustLevelIndex) {
            EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching subUid=" + keyObj.keyId + " found but not enough trust\n");
          }
          else {
            // subkey with enough trust level found
            EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  matching subUid in key=" + keyObj.keyId + " keyTrust=\"" + keyTrust + "\" found\n");

            if (keyTrustIndex >= fullTrustIndex) {
              // immediately return if a fully or ultimately trusted key is found
              // (faked keys should not be an issue here, so we don't have to check other keys)
              return keyObj.keyId;
            }

            if (foundKeyId != keyObj.keyId) {
              // new matching key found (note: might find same key via different subkeys)
              if (foundKeyId) {
                // different matching keys found
                if (foundKeyTrustIndex > subUidTrustIndex) {
                  return foundKeyId; // OK, previously found key has higher trust level
                }
                // error because we have two keys with same trust level
                // => let the user decide (to prevent from using faked keys with default trust level)
                if (details) {
                  details.msg = "ProblemMultipleKeys";
                }
                let msg = "multiple matching keys with same trust level found for '" + emailAddr + "' ";
                EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  " + msg +
                  " trustLevel=\"" + keyTrust + "\" (0x" + foundKeyId + " and 0x" + keyObj.keyId + ")\n");
                return null;
              }
              // save found key to compare with other matching keys (handling of faked keys)
              foundKeyId = keyObj.keyId;
              foundKeyTrustIndex = subUidTrustIndex;
            }
          }
        }
      }

    } // **** LOOP to check against each key

    if (!foundKeyId) {
      EnigmailLog.DEBUG("keyRing.jsm: getValidKeyForRecipient():  no key for '" + emailAddr + "' found\n");
    }
    return foundKeyId;
  },


  getValidKeysForAllRecipients: function(addresses, minTrustLevel, details, resultingArray) {

    let minTrustLevelIndex = TRUSTLEVELS_SORTED.indexOf(minTrustLevel);

    // check whether each address is or has a key:
    let keyMissing = false;
    if (details) {
      details.errArray = [];
    }
    for (let i = 0; i < addresses.length; i++) {
      let addr = addresses[i];
      // try to find current address in key list:
      var found = false;
      var errMsg = null;
      if (addr.indexOf('@') >= 0) {
        // try email match:
        var addrErrDetails = {};
        let keyId = this.getValidKeyForRecipient(addr, minTrustLevelIndex, addrErrDetails);
        if (details && addrErrDetails.msg) {
          errMsg = addrErrDetails.msg;
        }
        if (keyId) {
          found = true;
          resultingArray.push("0x" + keyId.toUpperCase());
        }
      }
      else {
        // try key match:
        var keyObj = this.getKeyById(addr);

        if (keyObj) {
          // if found, check whether the trust level is enough
          if (TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust) >= minTrustLevelIndex) {
            found = true;
            resultingArray.push("0x" + keyObj.keyId.toUpperCase());
          }
        }
      }
      if (!found) {
        // no key for this address found
        keyMissing = true;
        if (details) {
          if (!errMsg) {
            errMsg = "ProblemNoKey";
          }
          var detailsElem = {};
          detailsElem.addr = addr;
          detailsElem.msg = errMsg;
          details.errArray.push(detailsElem);
        }
        EnigmailLog.DEBUG("keyRing.jsm: doValidKeysForAllRecipients(): return null (no single valid key found for=\"" + addr + "\" with minTrustLevel=\"" + minTrustLevel + "\")\n");
      }
    }
    return keyMissing;
  }

}; //  EnigmailKeyRing


/************************ INTERNAL FUNCTIONS ************************/

/**
 * returns the output of --with-colons --list[-secret]-keys
 */
function getUserIdList(secretOnly, refresh, exitCodeObj, statusFlagsObj, errorMsgObj) {
  if (refresh ||
    (secretOnly && secretKeyList === null) ||
    ((!secretOnly) && userIdList === null)) {
    let args = EnigmailGpg.getStandardArgs(true);

    if (secretOnly) {
      args = args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-secret-keys"]);
    }
    else {
      if (refresh) EnigmailKeyRing.clearCache();
      args = args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-sigs"]);
    }

    statusFlagsObj.value = 0;

    const cmdErrorMsgObj = {};
    let listText = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, statusFlagsObj, {}, cmdErrorMsgObj);
    if (!(statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE)) {
      // ignore exit code as recommended by GnuPG authors
      exitCodeObj.value = 0;
    }

    if (exitCodeObj.value !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    listText = listText.replace(/(\r\n|\r)/g, "\n");
    if (secretOnly) {
      secretKeyList = listText;
      return listText;
    }
    userIdList = listText;
  }
  else {
    exitCodeObj.value = 0;
    statusFlagsObj.value = 0;
    errorMsgObj.value = "";
  }

  if (secretOnly) {
    return secretKeyList;
  }

  return userIdList;
}


/**
 * Get key list from GnuPG. If the keys may be pre-cached already
 *
 * @win        - |object| parent window for displaying error messages
 * @secretOnly - |boolean| true: get secret keys / false: get public keys
 * @refresh    - |boolean| if true, cache is cleared and all keys are loaded from GnuPG
 *
 * @return - |array| of : separated key list entries as specified in GnuPG doc/DETAILS
 */
function obtainKeyList(win, secretOnly, refresh) {
  EnigmailLog.DEBUG("keyRing.jsm: obtainKeyList\n");

  let userList = null;
  try {
    const exitCodeObj = {};
    const errorMsgObj = {};

    userList = getUserIdList(secretOnly,
      refresh,
      exitCodeObj, {},
      errorMsgObj);
    if (exitCodeObj.value !== 0) {
      EnigmailDialog.alert(win, errorMsgObj.value);
      return null;
    }
  }
  catch (ex) {
    EnigmailLog.ERROR("ERROR in keyRing.jsm: obtainKeyList: " + ex.toString() + "\n");
  }

  if (typeof(userList) == "string") {
    return userList.split(/\n/);
  }
  else {
    return [];
  }
}

function sortByUserId(keyListObj, sortDirection) {
  return function(a, b) {
    return (a.userId < b.userId) ? -sortDirection : sortDirection;
  };
}

const sortFunctions = {
  keyid: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (a.keyId < b.keyId) ? -sortDirection : sortDirection;
    };
  },

  keyidshort: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (a.keyId.substr(-8, 8) < b.keyId.substr(-8, 8)) ? -sortDirection : sortDirection;
    };
  },

  fpr: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].fpr < keyListObj.keyList[b.keyNum].fpr) ? -sortDirection : sortDirection;
    };
  },

  keytype: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].secretAvailable < keyListObj.keyList[b.keyNum].secretAvailable) ? -sortDirection : sortDirection;
    };
  },

  validity: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (EnigmailTrust.trustLevelsSorted().indexOf(EnigmailTrust.getTrustCode(keyListObj.keyList[a.keyNum])) < EnigmailTrust.trustLevelsSorted().indexOf(EnigmailTrust.getTrustCode(
        keyListObj.keyList[b.keyNum]))) ? -sortDirection : sortDirection;
    };
  },

  trust: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (EnigmailTrust.trustLevelsSorted().indexOf(keyListObj.keyList[a.keyNum].ownerTrust) < EnigmailTrust.trustLevelsSorted().indexOf(keyListObj.keyList[b.keyNum].ownerTrust)) ? -
        sortDirection : sortDirection;
    };
  },

  expiry: function(keyListObj, sortDirection) {
    return function(a, b) {
      return (keyListObj.keyList[a.keyNum].expiryTime < keyListObj.keyList[b.keyNum].expiryTime) ? -sortDirection : sortDirection;
    };
  }
};

function getSortFunction(type, keyListObj, sortDirection) {
  return (sortFunctions[type] || sortByUserId)(keyListObj, sortDirection);
}


/**
 * Return string with all colon-separated data of key list entry of given key.
 * - key may be pub or sub key.
 *
 * @param  String  keyId of 8 or 16 chars key with optionally leading 0x
 * @return String  entry of first found user IDs with keyId or null if none
 */
function getKeyListEntryOfKey(keyId) {
  keyId = keyId.replace(/^0x/, "");

  let statusFlags = {};
  let errorMsg = {};
  let exitCodeObj = {};
  let listText = getUserIdList(false, false, exitCodeObj, statusFlags, errorMsg);

  // listText contains lines such as:
  // tru::0:1407688184:1424970931:3:1:5
  // pub:f:1024:17:D581C6F8EBB80E50:1107251639:::-:::scESC:
  // fpr:::::::::492A198AEA5EBE5574A1CE00D581C6F8EBB80E50:
  // uid:f::::1107251639::2D505D1F6E744365B3B35FF11F32A19779E3A417::Giosue Vitaglione <gvi@whitestein.com>:
  // sub:f:2048:16:2223D7E0301A66C6:1107251647::::::e:

  // search for key or subkey
  let regexKey = new RegExp("^(pub|sub):[^:]*:[^:]*:[^:]*:[A-Fa-f0-9]*" + keyId + ":", "m");
  let foundPos = listText.search(regexKey);
  if (foundPos < 0) {
    return null;
  }

  // find area of key entries in key list
  // note: if subkey matches, key entry starts before
  let regexPub = new RegExp("^pub:", "ym");
  let startPos;

  if (listText[foundPos] == "p") { // ^pub:
    // KEY matches
    startPos = foundPos;
  }
  else {
    // SUBKEY matches
    // search for pub entry right before sub entry
    startPos = 0;
    let match = regexPub.exec(listText.substr(0, foundPos));
    while (match && match.index < foundPos) {
      startPos = match.index;
      match = regexPub.exec(listText);
    }
  }
  // find end of entry (next pub entry or end):
  let match = regexPub.exec(listText.substr(startPos + 1));
  let res;
  if (match && match.index) {
    res = listText.substring(startPos, startPos + 1 + match.index);
  }
  else {
    res = listText.substring(startPos);
  }
  return res;
}


/**
 * Load the key list into memory and return it sorted by a specified column
 *
 * @param win        - |object|  holding the parent window for displaying error messages
 * @param refresh    - |boolean| if true, cache is cleared and all keys are loaded from GnuPG
 * @param keyListObj - |object|  holding the resulting key list
 * @param sortColumn - |string|  containing the column name for sorting. One of:
 *                               userid, keyid, keyidshort, fpr, keytype, validity, trust, expiry.
 *                              Null will sort by userid.
 * @param sortDirection - |number| 1 = ascending / -1 = descending
 *
 * no return value
 */
function loadKeyList(win, refresh, keyListObj, sortColumn, sortDirection) {
  EnigmailLog.DEBUG("keyRing.jsm: loadKeyList()\n");

  if (!sortColumn) sortColumn = "userid";
  if (!sortDirection) sortDirection = 1;

  const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

  var aGpgUserList = obtainKeyList(win, false, refresh);
  if (!aGpgUserList) return;

  var aGpgSecretsList = obtainKeyList(win, true, refresh);
  if (!aGpgSecretsList && !refresh) {
    if (EnigmailDialog.confirmDlg(EnigmailLocale.getString("noSecretKeys"),
        EnigmailLocale.getString("keyMan.button.generateKey"),
        EnigmailLocale.getString("keyMan.button.skip"))) {
      EnigmailWindows.openKeyGen();
      loadKeyList(win, true, keyListObj);
    }
  }

  createAndSortKeyList(aGpgUserList, aGpgSecretsList, keyListObj, sortColumn, sortDirection);
}


// returns the output of --with-colons --list-sig
function getKeySig(keyId, exitCodeObj, errorMsgObj) {
  const args = EnigmailGpg.getStandardArgs(true).
  concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-sig"]).
  concat(keyId.split(" "));

  const statusFlagsObj = {};
  const cmdErrorMsgObj = {};
  const listText = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, statusFlagsObj, {}, cmdErrorMsgObj);

  if (!(statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE)) {
    // ignore exit code as recommended by GnuPG authors
    exitCodeObj.value = 0;
  }

  if (exitCodeObj.value !== 0) {
    errorMsgObj.value = EnigmailLocale.getString("badCommand");
    if (cmdErrorMsgObj.value) {
      errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
      errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
    }

    return "";
  }
  return listText;
}

/**
 * Return signatures for a given key list
 *
 * @param String gpgKeyList         Output from gpg such as produced by getKeySig()
 *                                  Only the first public key is processed!
 * @param Boolean ignoreUnknownUid  true if unknown signer's UIDs should be filtered out
 *
 * @return Array of Object:
 *     - uid
 *     - uidLabel
 *     - creationDate
 *     - sigList: [uid, creationDate, signerKeyId, sigType ]
 */

function extractSignatures(gpgKeyList, ignoreUnknownUid) {
  EnigmailLog.DEBUG("keyRing.jsm: extractSignatures: " + gpgKeyList + "\n");

  var listObj = {};

  let havePub = false;
  let currUid = "",
    keyId = "",
    fpr = "";

  const lineArr = gpgKeyList.split(/\n/);
  for (let i = 0; i < lineArr.length; i++) {
    // process lines such as:
    //  tru::1:1395895453:1442881280:3:1:5
    //  pub:f:4096:1:C1B875ED336XX959:2299509307:1546189300::f:::scaESCA:
    //  fpr:::::::::102A1C8CC524A966849C33D7C8B157EA336XX959:
    //  uid:f::::1388511201::67D5B96DC564598D4D4D9E0E89F5B83C9931A154::Joe Fox <joe@fox.com>:
    //  sig:::1:C8B157EA336XX959:2299509307::::Joe Fox <joe@fox.com>:13x:::::2:
    //  sub:e:2048:1:B214734F0F5C7041:1316219469:1199912694:::::e:
    //  sub:f:2048:1:70E7A471DABE08B0:1316221524:1546189300:::::s:
    const lineTokens = lineArr[i].split(/:/);
    switch (lineTokens[ENTRY_ID]) {
      case "pub":
        if (havePub) {
          return listObj;
        }
        havePub = true;
        keyId = lineTokens[KEY_ID];
        break;
      case "fpr":
        if (fpr === "") fpr = lineTokens[USERID_ID];
        break;
      case "uid":
      case "uat":
        currUid = lineTokens[UID_ID];
        listObj[currUid] = {
          userId: lineTokens[ENTRY_ID] == "uat" ? EnigmailLocale.getString("keyring.photo") : EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
          rawUserId: lineTokens[USERID_ID],
          keyId: keyId,
          fpr: fpr,
          created: EnigmailTime.getDateTime(lineTokens[CREATED_ID], true, false),
          sigList: []
        };
        break;
      case "sig":
        if (lineTokens[SIG_TYPE_ID].substr(0, 2).toLowerCase() !== "1f") {
          // ignrore revoked signature

          let sig = {
            userId: EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
            created: EnigmailTime.getDateTime(lineTokens[CREATED_ID], true, false),
            signerKeyId: lineTokens[KEY_ID],
            sigType: lineTokens[SIG_TYPE_ID],
            sigKnown: lineTokens[USERID_ID] != UNKNOWN_SIGNATURE
          };

          if (!ignoreUnknownUid || sig.userId != UNKNOWN_SIGNATURE) {
            listObj[currUid].sigList.push(sig);
          }
        }
        break;
    }
  }

  return listObj;
}

/**
 * Create a list of objects representing the keys in a key list
 *
 * @keyListString: array of |string| formatted output from GnuPG for key listing
 * @keyListObj:    |object| holding the resulting key list:
 *                     obj.keyList:     Array holding key objects
 *                     obj.keySortList: Array holding values to make sorting easier
 *
 * no return value
 */
function createKeyObjects(keyListString, keyListObj) {
  keyListObj.keyList = [];
  keyListObj.keySortList = [];
  keyListObj.trustModel = "?";

  let keyObj = {};
  let uatNum = 0; // counter for photos (counts per key)
  let numKeys = 0;

  const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

  for (let i = 0; i < keyListString.length; i++) {
    const listRow = keyListString[i].split(/:/);
    if (listRow.length >= 0) {
      switch (listRow[ENTRY_ID]) {
        case "pub":
          keyObj = new KeyObject(listRow);
          uatNum = 0;
          ++numKeys;
          keyListObj.keyList.push(keyObj);
          break;
        case "fpr":
          // only take first fpr line, this is the fingerprint of the primary key and what we want
          if (keyObj.fpr === "") {
            keyObj.fpr = listRow[USERID_ID];
          }
          break;
        case "uid":
          if (listRow[USERID_ID].length === 0) {
            listRow[USERID_ID] = "-";
          }
          if (typeof(keyObj.userId) !== "string") {
            keyObj.userId = EnigmailData.convertGpgToUnicode(listRow[USERID_ID]);
            keyListObj.keySortList.push({
              userId: keyObj.userId.toLowerCase(),
              keyId: keyObj.keyId,
              keyNum: numKeys - 1
            });
            if (TRUSTLEVELS_SORTED.indexOf(listRow[KEY_TRUST_ID]) < TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust)) {
              // reduce key trust if primary UID is less trusted than public key
              keyObj.keyTrust = listRow[KEY_TRUST_ID];
            }
          }
          else {
            keyObj.SubUserIds.push({
              userId: EnigmailData.convertGpgToUnicode(listRow[USERID_ID]),
              keyTrust: listRow[KEY_TRUST_ID],
              type: "uid"
            });
          }
          break;
        case "sub":
          keyObj.subKeys.push({
            keyId: listRow[KEY_ID],
            expiry: EnigmailTime.getDateTime(listRow[EXPIRY_ID], true, false),
            expiryTime: Number(listRow[EXPIRY_ID]),
            keyTrust: listRow[KEY_TRUST_ID],
            keyUseFor: listRow[KEY_USE_FOR_ID],
            keySize: listRow[KEY_SIZE_ID],
            algorithm: listRow[KEY_ALGO_ID],
            created: EnigmailTime.getDateTime(listRow[CREATED_ID], true, false),
            type: "sub"
          });
          break;
        case "uat":
          if (listRow[USERID_ID].indexOf("1 ") === 0) {
            const userId = EnigmailLocale.getString("userAtt.photo");
            keyObj.SubUserIds.push({
              userId: userId,
              keyTrust: listRow[KEY_TRUST_ID],
              type: "uat",
              uatNum: uatNum
            });
            keyObj.photoAvailable = true;
            ++uatNum;
          }
          break;
        case "sig":
          if (keyListString.indexOf("10l") >= 0) keyListObj.lsigned = true;
          break;
        case "tru":
          keyListObj.trustModel = "?";
          if (listRow[KEY_TRUST_ID].indexOf("t") >= 0) {
            if (listRow[KEY_SIZE_ID] === "0") {
              keyListObj.trustModel = "p";
            }
            else if (listRow[KEY_SIZE_ID] === "1") {
              keyListObj.trustModel = "t";
            }
          }
          else {
            if (listRow[KEY_SIZE_ID] === "0") {
              keyListObj.trustModel = "a";
            }
          }
      }
    }
  }
}

function createAndSortKeyList(aGpgUserList, aGpgSecretsList, keyListObj, sortColumn, sortDirection) {
  EnigmailLog.DEBUG("keyRing.jsm: createAndSortKeyList()\n");

  createKeyObjects(aGpgUserList, keyListObj);

  // search and mark keys that have secret keys
  for (let i = 0; i < aGpgSecretsList.length; i++) {
    let listRow = aGpgSecretsList[i].split(/:/);
    if (listRow.length >= 0) {
      if (listRow[ENTRY_ID] == "sec") {
        let k = EnigmailKeyRing.getKeyById(listRow[KEY_ID]);
        if (k && typeof(k) === "object") {
          k.secretAvailable = true;
        }
      }
    }
  }

  keyListObj.keySortList.sort(getSortFunction(sortColumn.toLowerCase(), keyListObj, sortDirection));
}

/************************ IMPLEMENTATION of KeyObject ************************/


function KeyObject(lineArr) {
  if (lineArr[ENTRY_ID] === "pub") {
    this.keyId = lineArr[KEY_ID];
    this.expiry = EnigmailTime.getDateTime(lineArr[EXPIRY_ID], true, false);
    this.expiryTime = Number(lineArr[EXPIRY_ID]);
    this.created = EnigmailTime.getDateTime(lineArr[CREATED_ID], true, false);
    this.keyTrust = lineArr[KEY_TRUST_ID];
    this.keyUseFor = lineArr[KEY_USE_FOR_ID];
    this.ownerTrust = lineArr[OWNERTRUST_ID];
    this.algorithm = lineArr[KEY_ALGO_ID];
    this.keySize = lineArr[KEY_SIZE_ID];
  }
  else {
    this.keyId = "";
    this.expiry = "";
    this.expiryTime = 0;
    this.created = "";
    this.keyTrust = "";
    this.keyUseFor = "";
    this.ownerTrust = "";
    this.algorithm = "";
    this.keySize = "";
  }
  this.type = lineArr[ENTRY_ID];
  this.SubUserIds = [];
  this.subKeys = [];
  this.fpr = "";
  this.photoAvailable = false;
  this.secretAvailable = false;
  this._sigList = null;
}

KeyObject.prototype = {
  /**
   * gettter that returns a list of all signatures found on the key
   *
   * @return Array of Object, or null in case of error:
   *     - uid
   *     - uidLabel
   *     - creationDate
   *     - sigList: Array of object: { uid, creationDate, signerKeyId, sigType }
   */
  get signatures() {
    if (this._sigList === null) {
      let exitCodeObj = {},
        errorMsgObj = {};
      let r = getKeySig(this.keyId, exitCodeObj, errorMsgObj);

      if (r.length > 0) {
        this._sigList = extractSignatures(r, false);
      }
    }

    return this._sigList;
  },

  /**
   * create a copy of the object
   */
  clone: function() {
    let cp = new KeyObject(["copy"]);
    for (let i in this) {
      if (typeof i === "object") {
        cp[i] = EnigmailFuncs.cloneObj(this[i]);
      }
      else if (i !== "signatures") {
        cp[i] = this[i];
      }
    }

    return cp;
  }
};

EnigmailKeyRing.clearCache();
