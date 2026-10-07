// ---------- Login / Register ----------
const authBox = document.getElementById("authBox");
const appBox = document.getElementById("app");
const userBar = document.getElementById("userBar");
const whoami = document.getElementById("whoami");
const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const authError = document.getElementById("authError");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

// App dikhao (login ke baad)
function showApp(username) {
  authBox.style.display = "none";
  appBox.style.display = "block";
  userBar.style.display = "block";
  whoami.textContent = "Welcome, " + username + "  ";

  // Is user ka apna data load karo
  loadTasks();
  loadExpenses();
  loadNotes();
  loadAssignments();
}

// Login page dikhao
function showAuth() {
  authBox.style.display = "block";
  appBox.style.display = "none";
  userBar.style.display = "none";
}

// Login ya register ki request bhejo
async function sendAuth(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: authUser.value,
      password: authPass.value
    })
  });

  const data = await res.json();

  if (!res.ok) {
    authError.textContent = data.error;
    return;
  }

  authError.textContent = "";
  authPass.value = "";
  showApp(data.username);
}

loginBtn.addEventListener("click", function () {
  sendAuth("/api/login");
});

registerBtn.addEventListener("click", function () {
  sendAuth("/api/register");
});

logoutBtn.addEventListener("click", async function () {
  await fetch("/api/logout", { method: "POST" });
  showAuth();
});

// Page khulte hi check karo ke pehle se login hai ya nahi
async function checkLogin() {
  const res = await fetch("/api/me");
  const data = await res.json();

  if (data.loggedIn) {
    showApp(data.username);
  } else {
    showAuth();
  }
}

checkLogin();