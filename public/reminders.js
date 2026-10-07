// ---------- Reminders ----------
const reminderForm = document.getElementById("reminderForm");
const reminderTitle = document.getElementById("reminderTitle");
const reminderKind = document.getElementById("reminderKind");
const reminderAt = document.getElementById("reminderAt");
const reminderSave = document.getElementById("reminderSave");
const reminderStatus = document.getElementById("reminderStatus");
const reminderList = document.getElementById("reminderList");
const reminderAlert = document.getElementById("reminderAlert");
const reminderAlertText = document.getElementById("reminderAlertText");
const reminderPermission = document.getElementById("reminderPermission");
const reminderPermissionStatus = document.getElementById("reminderPermissionStatus");
let reminders = [];
let checkingReminders = false;

function localDateTimeInput(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

function refreshReminderPermissionLabel() {
  if (!("Notification" in window)) {
    reminderPermission.textContent = "Browser notifications unavailable";
    reminderPermission.disabled = true;
    reminderPermissionStatus.textContent = "Alerts app ke andar dikhengi; is browser mein popup notifications supported nahi.";
    return;
  }
  const permission = Notification.permission;
  reminderPermission.textContent = permission === "granted" ? "Browser notifications enabled" :
    (permission === "denied" ? "Notifications blocked in browser" : "Enable browser notifications");
  reminderPermission.disabled = permission !== "default";
  reminderPermissionStatus.textContent = permission === "granted" ? "Browser notifications enabled hain." :
    (permission === "denied" ? "Browser settings mein StudyDesk notifications allow karein; app ke andar alert phir bhi dikhayega." : "Popup alerts ke liye browser permission dein.");
}

function setReminderStatus(message, isError) {
  reminderStatus.textContent = message;
  reminderStatus.classList.toggle("is-error", Boolean(isError));
  reminderStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function showReminderAlert(reminder) {
  const when = new Date(reminder.remind_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  reminderAlertText.textContent = reminder.kind + ": " + reminder.title + " · " + when;
  reminderAlert.hidden = false;
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const notification = new Notification("StudyDesk reminder", {
        body: reminder.kind + ": " + reminder.title,
        tag: "studydesk-reminder-" + reminder.id
      });
      notification.onclick = function () { window.focus(); notification.close(); };
    } catch (error) {
      // Keep the in-app alert visible if desktop notifications are unavailable.
    }
  }
}

function renderReminders() {
  reminderList.replaceChildren();
  if (!reminders.length) {
    const empty = document.createElement("p");
    empty.className = "reminder-empty";
    empty.textContent = "Abhi reminder nahi. Assignment, class, ya study session ka time add karein.";
    reminderList.appendChild(empty);
    return;
  }
  const now = Date.now();
  reminders.forEach(function (reminder) {
    const item = document.createElement("article");
    item.className = "reminder-card";
    if (reminder.is_done) item.classList.add("is-done");
    const copy = document.createElement("div");
    copy.className = "reminder-copy";
    const title = document.createElement("h3");
    title.textContent = reminder.title;
    const meta = document.createElement("span");
    meta.className = "reminder-kind";
    meta.textContent = reminder.kind;
    const time = document.createElement("time");
    time.dateTime = reminder.remind_at;
    time.textContent = new Date(reminder.remind_at).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
    const state = document.createElement("small");
    state.className = "reminder-state";
    if (reminder.is_done) state.textContent = "Done";
    else if (reminder.notified_at) state.textContent = "Alert sent";
    else if (new Date(reminder.remind_at).getTime() <= now) state.textContent = "Due now";
    else state.textContent = "Scheduled";
    copy.append(title, meta, time, state);

    const actions = document.createElement("div");
    actions.className = "reminder-actions";
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = reminder.is_done ? "Undo" : "Done";
    done.disabled = Boolean(window.isStudyDeskOffline);
    done.addEventListener("click", async function () {
      done.disabled = true;
      try {
        const response = await apiFetch("/api/reminders/" + reminder.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_done: !reminder.is_done })
        });
        if (!response.ok) throw new Error("Reminder update nahi hua.");
        reminder.is_done = reminder.is_done ? 0 : 1;
        renderReminders();
        setReminderStatus(reminder.is_done ? "Reminder complete mark ho gaya." : "Reminder dobara active hai.", false);
      } catch (error) {
        done.disabled = false;
        setReminderStatus(error.message || "Server se rabta nahi ho saka.", true);
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "reminder-delete";
    remove.textContent = "Delete";
    remove.disabled = Boolean(window.isStudyDeskOffline);
    remove.addEventListener("click", async function () {
      if (!window.confirm("Delete this reminder?")) return;
      remove.disabled = true;
      try {
        const response = await apiFetch("/api/reminders/" + reminder.id, { method: "DELETE" });
        if (!response.ok) throw new Error("Reminder delete nahi hua.");
        reminders = reminders.filter(function (item) { return item.id !== reminder.id; });
        renderReminders();
        setReminderStatus("Reminder delete ho gaya.", false);
      } catch (error) {
        remove.disabled = false;
        setReminderStatus(error.message || "Server se rabta nahi ho saka.", true);
      }
    });
    actions.append(done, remove);
    item.append(copy, actions);
    reminderList.appendChild(item);
  });
}

async function checkDueReminders() {
  if (checkingReminders || window.isStudyDeskOffline) return;
  checkingReminders = true;
  try {
    const due = reminders.filter(function (reminder) {
      return !reminder.is_done && !reminder.notified_at && new Date(reminder.remind_at).getTime() <= Date.now();
    });
    for (const reminder of due) {
      showReminderAlert(reminder);
      const response = await apiFetch("/api/reminders/" + reminder.id + "/notified", { method: "POST" });
      if (response.ok) reminder.notified_at = new Date().toISOString();
    }
    if (due.length) renderReminders();
  } catch (error) {
    setReminderStatus("Reminder alert save nahi hua. Server connection check karein.", true);
  } finally {
    checkingReminders = false;
  }
}

async function loadReminders() {
  try {
    const response = await apiFetch("/api/reminders");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Reminders API load nahi hui. Server restart karke page refresh karein."
      : "Reminders load nahi ho sake.");
    reminders = await response.json();
    renderReminders();
    checkDueReminders();
  } catch (error) {
    reminderList.textContent = error.message || "Internet/server connection check karein.";
  }
}

window.clearReminders = function () {
  reminders = [];
  reminderAlert.hidden = true;
  renderReminders();
};

reminderForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  reminderSave.disabled = true;
  reminderSave.textContent = "Saving...";
  setReminderStatus("", false);
  try {
    const response = await apiFetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: reminderTitle.value, kind: reminderKind.value, remind_at: reminderAt.value })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Reminder save nahi hua.");
    reminders.push(data);
    reminders.sort(function (a, b) { return a.remind_at.localeCompare(b.remind_at); });
    reminderForm.reset();
    reminderAt.min = localDateTimeInput(new Date(Date.now() + 60000));
    renderReminders();
    setReminderStatus("Reminder save ho gaya.", false);
  } catch (error) {
    setReminderStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    reminderSave.disabled = Boolean(window.isStudyDeskOffline);
    reminderSave.textContent = "Add reminder";
  }
});

reminderPermission.addEventListener("click", async function () {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  refreshReminderPermissionLabel();
  if (permission === "granted") setReminderStatus("Browser notifications on ho gayi hain.", false);
  else setReminderStatus("Popup permission nahi mili. Reminder app ke andar phir bhi show hoga.", true);
});

document.getElementById("reminderAlertClear").addEventListener("click", function () {
  reminderAlert.hidden = true;
});

window.addEventListener("studydesk:offline-change", function () {
  reminderSave.disabled = Boolean(window.isStudyDeskOffline);
  renderReminders();
});
document.addEventListener("visibilitychange", checkDueReminders);
setInterval(checkDueReminders, 15000);
reminderAt.min = localDateTimeInput(new Date(Date.now() + 60000));
refreshReminderPermissionLabel();
