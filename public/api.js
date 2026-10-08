// Shared API request handling: keep session cookies and return expired users to login.
window.apiFetch = async function (input, options) {
  const settings = Object.assign({ credentials: "include" }, options || {});
  if (!settings.signal && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    settings.signal = AbortSignal.timeout(6000);
  }
  const requestUrl = new URL(typeof input === "string" ? input : input.url, window.location.href);
  const isApiRequest = requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/");
  const isAuthCheck = ["/api/login", "/api/register", "/api/me"].includes(requestUrl.pathname);
  let response;
  try {
    response = await window.fetch(input, settings);
  } catch (error) {
    if (isApiRequest && typeof window.setStudyDeskOffline === "function") window.setStudyDeskOffline();
    throw new Error("Server se rabta nahi ho saka. Internet connection check karein.");
  }

  if (isApiRequest && response.status === 401 && !isAuthCheck && typeof window.showAuth === "function") {
    window.showAuth();
    const message = document.getElementById("authError");
    if (message) message.textContent = "Session khatam ho gaya. Dobara login karein.";
  }

  return response;
};
