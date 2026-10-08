const installAppBtn = document.getElementById("installAppBtn");
let pendingInstallPrompt = null;

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  pendingInstallPrompt = event;
  installAppBtn.hidden = false;
});

installAppBtn.addEventListener("click", async function () {
  if (!pendingInstallPrompt) return;
  pendingInstallPrompt.prompt();
  const choice = await pendingInstallPrompt.userChoice;
  if (choice.outcome === "accepted") installAppBtn.hidden = true;
  pendingInstallPrompt = null;
});

window.addEventListener("appinstalled", function () {
  pendingInstallPrompt = null;
  installAppBtn.hidden = true;
});

if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
  installAppBtn.hidden = true;
}
