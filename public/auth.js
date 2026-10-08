// ---------- Login / Register ----------
const authBox = document.getElementById("authBox");
const appBox = document.getElementById("app");
const userBar = document.getElementById("userBar");
const whoami = document.getElementById("whoami");
const authUser = document.getElementById("authUser");
const authEmail = document.getElementById("authEmail");
const authDob = document.getElementById("authDob");
const authPass = document.getElementById("authPass");
const authConfirmPass = document.getElementById("authConfirmPass");
const authRegisterPanel = document.getElementById("authRegisterPanel");
const authError = document.getElementById("authError");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authUserLabel = document.getElementById("authUserLabel");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const authModeToggle = document.getElementById("authModeToggle");
const logoutBtn = document.getElementById("logoutBtn");
const offlineNotice = document.getElementById("offlineNotice");

window.isStudyDeskOffline = false;
let isRegisterMode = false;

function setAuthMode(registerMode) {
  isRegisterMode = Boolean(registerMode);
  authTitle.textContent = isRegisterMode ? "Create your account" : "Welcome back!";
  authSubtitle.textContent = isRegisterMode
    ? "Set up your StudyDesk profile to get started."
    : "Sign in to keep your study life on track.";
  authRegisterPanel.hidden = !isRegisterMode;
  [authEmail, authDob, authConfirmPass].forEach(function (input) {
    input.required = isRegisterMode;
  });
  loginBtn.hidden = isRegisterMode;
  registerBtn.hidden = !isRegisterMode;
  authModeToggle.textContent = isRegisterMode
    ? "Already have an account? Log in"
    : "New to StudyDesk? Create an account";
  authModeToggle.setAttribute("aria-expanded", String(isRegisterMode));
  authModeToggle.classList.toggle("is-register", isRegisterMode);
  authPass.autocomplete = isRegisterMode ? "new-password" : "current-password";
  authDob.max = new Date().toISOString().slice(0, 10);
  authUserLabel.textContent = isRegisterMode ? "Username" : "Username or email";
  authUser.placeholder = isRegisterMode ? "Choose a username" : "Enter username or email";
  authError.textContent = "";
}

authModeToggle.addEventListener("click", function () {
  setAuthMode(!isRegisterMode);
});

function setStudyDeskOffline(isOffline) {
  window.isStudyDeskOffline = Boolean(isOffline);
  offlineNotice.hidden = !window.isStudyDeskOffline;
  [
    document.getElementById("taskInput"),
    document.getElementById("taskSubject"),
    document.getElementById("taskPriority"),
    document.getElementById("taskDue"),
    document.getElementById("taskRepeat"),
    document.getElementById("addBtn"),
    document.getElementById("taskCancelBtn"),
    document.getElementById("noteTitle"),
    document.getElementById("noteContent"),
    document.getElementById("noteSaveBtn"),
    document.getElementById("noteCancelBtn"),
    document.getElementById("studyPlanSubject"),
    document.getElementById("studyPlanDay"),
    document.getElementById("studyPlanStart"),
    document.getElementById("studyPlanEnd"),
    document.getElementById("studyPlanGoal"),
    document.getElementById("studyPlanSave"),
    document.getElementById("studyPlanCancel"),
    document.getElementById("examTitle"),
    document.getElementById("examSubject"),
    document.getElementById("examDate"),
    document.getElementById("examSave"),
    document.getElementById("syllabusSubject"),
    document.getElementById("syllabusChapter"),
    document.getElementById("syllabusSave"),
    document.getElementById("flashcardQuestionInput"),
    document.getElementById("flashcardAnswerInput"),
    document.getElementById("flashcardSave"),
    document.getElementById("quizTitleInput"),
    document.getElementById("quizAddQuestion"),
    document.getElementById("quizSave"),
    document.getElementById("reminderTitle"),
    document.getElementById("reminderKind"),
    document.getElementById("reminderAt"),
    document.getElementById("reminderSave"),
    document.getElementById("gradeSubject"),
    document.getElementById("gradeAssessment"),
    document.getElementById("gradeScore"),
    document.getElementById("gradeTotal"),
    document.getElementById("gradeTarget"),
    document.getElementById("gradeSave"),
    document.getElementById("classSubject"),
    document.getElementById("classDay"),
    document.getElementById("classStart"),
    document.getElementById("classEnd"),
    document.getElementById("classRoom"),
    document.getElementById("classSave"),
    document.getElementById("classCancel")
  ].forEach(function (control) {
    if (control) control.disabled = window.isStudyDeskOffline;
  });
  if (window.isStudyDeskOffline) {
    if (typeof renderTasks === "function") renderTasks();
    if (typeof showNotes === "function") showNotes();
  }
  window.dispatchEvent(new CustomEvent("studydesk:offline-change", { detail: window.isStudyDeskOffline }));
}

window.setStudyDeskOffline = setStudyDeskOffline;

// App dikhao (login ke baad)
function showApp(username, offline) {
  document.body.classList.remove("auth-screen");
  window.studyDeskUser = username;
  if (!offline) StudyCache.rememberUser(username);
  setStudyDeskOffline(Boolean(offline));
  authBox.style.display = "none";
  appBox.style.display = "block";
  userBar.style.display = "block";
  whoami.textContent = "Welcome, " + username + "  ";

  // Is user ka apna data load karo
  loadTasks();
  loadExpenses();
  loadNotes();
  loadStudyPlan();
  loadExams();
  loadSyllabusTracker();
  loadFlashcards();
  loadQuizzes();
  loadQuizHistory();
  loadReminders();
  loadGrades();
  loadAnalytics();
  loadClasses();
  loadAssignments();
  loadDashboard();
}

// Login page dikhao
function showAuth() {
  document.body.classList.add("auth-screen");
  setStudyDeskOffline(false);
  window.studyDeskUser = null;
  if (typeof window.clearReminders === "function") window.clearReminders();
  authBox.style.display = "grid";
  appBox.style.display = "none";
  userBar.style.display = "none";
}

window.showAuth = showAuth;

// Login ya register ki request bhejo
async function sendAuth(url) {
  if (url === "/api/register" && authPass.value !== authConfirmPass.value) {
    authError.textContent = "Dono password ek jaise enter karein.";
    authConfirmPass.focus();
    return;
  }
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: authUser.value,
        email: authEmail.value,
        dateOfBirth: authDob.value,
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
    authConfirmPass.value = "";
    showApp(data.username);
  } catch (error) {
    authError.textContent = "Login server se nahi ho saka. Internet ya server check karein.";
  }
}

loginBtn.addEventListener("click", function () {
  sendAuth("/api/login");
});

registerBtn.addEventListener("click", function () {
  sendAuth("/api/register");
});

setAuthMode(false);

logoutBtn.addEventListener("click", async function () {
  const username = window.studyDeskUser;
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch (error) {
    // Logging out locally must still work when the server cannot be reached.
  } finally {
    if (username) StudyCache.clearUser(username);
    showAuth();
  }
});

// Page khulte hi check karo ke pehle se login hai ya nahi
async function checkLogin() {
  try {
    const res = await apiFetch("/api/me");
    const data = await res.json();
    if (data.loggedIn) {
      showApp(data.username);
    } else {
      showAuth();
    }
  } catch (error) {
    const username = StudyCache.lastUser();
    if (username && StudyCache.hasBackup(username)) {
      showApp(username, true);
    } else {
      showAuth();
      authError.textContent = "Server se rabta nahi ho saka. Internet check karein.";
    }
  }
}

window.addEventListener("online", function () {
  if (window.isStudyDeskOffline) checkLogin();
});

checkLogin();
