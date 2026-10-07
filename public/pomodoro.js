// ---------- Pomodoro Timer ----------
const pomoTime = document.getElementById("pomoTime");
const pomoBarFill = document.getElementById("pomoBarFill");
const pomoMessage = document.getElementById("pomoMessage");
const pomoStart = document.getElementById("pomoStart");
const pomoReset = document.getElementById("pomoReset");
const pomoCount = document.getElementById("pomoCount");
const pomoModeBtns = document.querySelectorAll(".pomo-mode");

// Durations are saved on this device so the timer can be personalized.
const POMO_SETTINGS_KEY = "studydesk-pomo-settings";
function readPomoSettings() {
  const defaults = { focus: 25, short: 5, long: 15 };
  try {
    const saved = JSON.parse(localStorage.getItem(POMO_SETTINGS_KEY));
    return {
      focus: Number.isInteger(saved.focus) && saved.focus >= 5 && saved.focus <= 120 ? saved.focus : defaults.focus,
      short: Number.isInteger(saved.short) && saved.short >= 1 && saved.short <= 30 ? saved.short : defaults.short,
      long: Number.isInteger(saved.long) && saved.long >= 5 && saved.long <= 60 ? saved.long : defaults.long
    };
  } catch (e) {
    return defaults;
  }
}
let POMO_MINUTES = readPomoSettings();
const pomoFocusMinutes = document.getElementById("pomoFocusMinutes");
const pomoShortMinutes = document.getElementById("pomoShortMinutes");
const pomoLongMinutes = document.getElementById("pomoLongMinutes");
const pomoSaveSettings = document.getElementById("pomoSaveSettings");

let pomoMode = "focus";
let pomoTotal = POMO_MINUTES.focus * 60; // kul seconds
let pomoRemaining = pomoTotal;           // baqi seconds
let pomoEnd = 0;                         // khatam hone ka waqt
let pomoTimer = null;                    // chalta hua timer
let audioCtx = null;                     // beep ke liye

pomoFocusMinutes.value = POMO_MINUTES.focus;
pomoShortMinutes.value = POMO_MINUTES.short;
pomoLongMinutes.value = POMO_MINUTES.long;

// Aaj ki date (jaise 2026-10-07), count isi ke naam se save hoga
function todayKey() {
  return "studydesk-pomo-" + new Date().toLocaleDateString("en-CA");
}

function getTodayCount() {
  try {
    return Number(localStorage.getItem(todayKey())) || 0;
  } catch (e) {
    return 0;
  }
}

function saveTodayCount(n) {
  try {
    localStorage.setItem(todayKey(), String(n));
  } catch (e) {}
}

// Seconds ko mm:ss mein badlo
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// Screen par time aur progress bar dikhao
function drawTimer() {
  pomoTime.textContent = formatTime(pomoRemaining);

  const done = pomoTotal > 0 ? 1 - pomoRemaining / pomoTotal : 0;
  pomoBarFill.style.width = done * 100 + "%";

  // Tab ke title mein bhi time dikhao jab timer chal raha ho
  document.title = pomoTimer
    ? formatTime(pomoRemaining) + " - StudyDesk"
    : "StudyDesk";
}

// Chhoti si beep awaaz
function beep() {
  if (!audioCtx) {
    return;
  }
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.start();
    setTimeout(function () {
      osc.stop();
    }, 600);
  } catch (e) {}
}

// Mode badlo (Focus / Short break / Long break)
function setMode(mode) {
  clearInterval(pomoTimer);
  pomoTimer = null;

  pomoMode = mode;
  pomoTotal = POMO_MINUTES[mode] * 60;
  pomoRemaining = pomoTotal;

  pomoModeBtns.forEach(function (b) {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  pomoStart.textContent = "Start";
  pomoMessage.textContent =
    mode === "focus" ? "Ready to focus?" : "Time to relax a bit.";
  drawTimer();
}

// Waqt khatam hone par
function finishTimer() {
  clearInterval(pomoTimer);
  pomoTimer = null;
  beep();

  if (pomoMode === "focus") {
    const count = getTodayCount() + 1;
    saveTodayCount(count);
    pomoCount.textContent = count;
    apiFetch("/api/analytics/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: POMO_MINUTES.focus })
    }).then(function (response) {
      if (!response.ok) throw new Error("Focus session save nahi hua.");
      if (typeof loadAnalytics === "function") loadAnalytics();
    }).catch(function () {});
    loadDashboard();

    // Har 4th session ke baad lamba break
    setMode(count % 4 === 0 ? "long" : "short");
    pomoMessage.textContent = "Great job! Time for a break. 🎉";
  } else {
    setMode("focus");
    pomoMessage.textContent = "Break is over. Ready for the next session?";
  }
}

// Har 0.25 second baad check karo kitna waqt bacha
function tick() {
  pomoRemaining = Math.max(0, Math.round((pomoEnd - Date.now()) / 1000));
  drawTimer();

  if (pomoRemaining === 0) {
    finishTimer();
  }
}

// Start / Pause
function toggleTimer() {
  // Browser ko awaaz ki ijazat button dabane par milti hai
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }

  if (pomoTimer) {
    // Chal raha hai to roko (pause)
    clearInterval(pomoTimer);
    pomoTimer = null;
    pomoStart.textContent = "Resume";
    pomoMessage.textContent = "Paused.";
    drawTimer();
  } else {
    // Ruka hua hai to chalao
    pomoEnd = Date.now() + pomoRemaining * 1000;
    pomoTimer = setInterval(tick, 250);
    pomoStart.textContent = "Pause";
    pomoMessage.textContent =
      pomoMode === "focus" ? "Stay focused! 💪" : "Relax, you earned it.";
  }
}

pomoStart.addEventListener("click", toggleTimer);

pomoReset.addEventListener("click", function () {
  setMode(pomoMode);
});

pomoModeBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    setMode(btn.dataset.mode);
  });
});

pomoSaveSettings.addEventListener("click", function () {
  const focus = Number(pomoFocusMinutes.value);
  const short = Number(pomoShortMinutes.value);
  const long = Number(pomoLongMinutes.value);
  if (!Number.isInteger(focus) || focus < 5 || focus > 120 ||
      !Number.isInteger(short) || short < 1 || short > 30 ||
      !Number.isInteger(long) || long < 5 || long > 60) {
    alert("Set focus to 5–120 minutes, short break to 1–30, and long break to 5–60.");
    return;
  }

  POMO_MINUTES = { focus: focus, short: short, long: long };
  try {
    localStorage.setItem(POMO_SETTINGS_KEY, JSON.stringify(POMO_MINUTES));
  } catch (e) {}
  setMode(pomoMode);
  pomoMessage.textContent = "Timer settings saved.";
});

// Page khulte hi
pomoCount.textContent = getTodayCount();
drawTimer();
