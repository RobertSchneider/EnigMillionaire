Components.utils.import("resource://enigmail/million.jsm");
Components.utils.import("resource://enigmail/execution.jsm"); /*global EnigmailExecution: false */
Components.utils.import("resource://enigmail/gpg.jsm"); /*global EnigmailGpg: false */
Components.utils.import("resource://enigmail/core.jsm"); /*global EnigmailGpg: false */
Components.utils.import("resource://enigmail/gpgAgent.jsm"); /*global EnigmailGpgAgent: false */
Components.utils.import("resource://enigmail/keyRing.jsm"); /*global EnigmailGpgAgent: false */

function onLoad() {
  dump("load! \n");
  var dlg = document.getElementById("enigmailMillionSecretDlg");
  dlg.getButton("extra1").setAttribute("label", "sign");
  dlg.getButton("extra1").setAttribute("oncommand", "onSign()");

  this.environment = Components.classes["@mozilla.org/process/environment;1"].getService(Components.interfaces.nsIEnvironment);
  EnigmailGpgAgent.setAgentPath(null, this);
  return true;
}

function onAccept() {
  window.close();
  return;
}

function onSign() {
  var exitCodeObj = {};
  var cmdErrorMsgObj = {};
  var statusFlagObjs = {};
  statusFlagObjs.value = 0;
  let args = EnigmailGpg.getStandardArgs(true);
  args.splice(args.indexOf("--batch"));
  dump(args);
  args = args.concat(["--lsign-key", "0x62E1D5A7"]);

  //let res = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "y\n", exitCodeObj, statusFlagObjs, {}, cmdErrorMsgObj);
  //var signs = EnigmailKeyRing.getSignes();
  //dump(signs);
  return;
}

function enigCloseDialog() {
  document.getElementById("enigmailMillionSecretDlg").cancelDialog();
  window.close();
  return;
}