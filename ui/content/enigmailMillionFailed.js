Components.utils.import("resource://enigmail/million.jsm");

function onLoad() {
  dump("load! \n");
  var dlg = document.getElementById("enigmailMillionFailed");
  return true;
}

function onAccept() {
  window.close();
  return;
}

function enigCloseDialog() {
  document.getElementById("enigmailMillionSecretDlg").cancelDialog();
  window.close();
  return;
}