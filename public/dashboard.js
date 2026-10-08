// ---------- Dashboard overview ----------
const dashboardStats = document.getElementById("dashboardStats");
const dashboardUpcoming = document.getElementById("dashboardUpcoming");
const dashboardTodayTasks = document.getElementById("dashboardTodayTasks");
const dashboardDate = document.getElementById("dashboardDate");
const dashboardWeatherIcon = document.getElementById("dashboardWeatherIcon");
const dashboardWeatherCity = document.getElementById("dashboardWeatherCity");
const dashboardWeatherDetail = document.getElementById("dashboardWeatherDetail");
const dashboardWeatherUpdated = document.getElementById("dashboardWeatherUpdated");

dashboardDate.textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric"
});

function makeDashboardStat(icon, label, value, detail, target, tone) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "dashboard-stat " + tone;
  card.dataset.go = target;

  const iconEl = document.createElement("span");
  iconEl.className = "dashboard-stat-icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;

  const labelEl = document.createElement("span");
  labelEl.className = "dashboard-stat-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.className = "dashboard-stat-value";
  valueEl.textContent = value;

  const detailEl = document.createElement("span");
  detailEl.className = "dashboard-stat-detail";
  detailEl.textContent = detail;

  card.append(iconEl, labelEl, valueEl, detailEl);
  return card;
}

function makeUpcomingItem(assignment) {
  const item = document.createElement("div");
  item.className = "dashboard-upcoming-item";

  const copy = document.createElement("div");
  copy.className = "dashboard-upcoming-copy";

  const title = document.createElement("strong");
  title.textContent = assignment.title;

  const subject = document.createElement("span");
  subject.textContent = assignment.subject;
  copy.append(title, subject);

  const due = document.createElement("span");
  due.className = "dashboard-due";
  if (!assignment.due_date) {
    due.textContent = "No due date";
  } else {
    const date = new Date(assignment.due_date + "T00:00:00");
    const days = Math.round((date - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    due.textContent = days < 0
      ? Math.abs(days) + "d late"
      : days === 0
        ? "Due today"
        : days === 1
          ? "Due tomorrow"
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (days <= 3) due.classList.add("urgent");
  }

  item.append(copy, due);
  return item;
}

function renderTodayTasks(tasks) {
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const dueToday = tasks.filter(function (task) { return !task.done && task.due_date === today; });
  dashboardTodayTasks.replaceChildren();

  if (dueToday.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dashboard-empty";
    empty.textContent = "Aaj ke liye koi pending task due nahi.";
    dashboardTodayTasks.appendChild(empty);
    return;
  }

  dueToday.forEach(function (task) {
    const item = document.createElement("div");
    item.className = "dashboard-today-item";
    const title = document.createElement("strong");
    title.textContent = task.text;
    const meta = document.createElement("span");
    const priority = task.priority === "Normal" ? "Medium" : (task.priority || "Medium");
    meta.textContent = [task.subject, priority + " priority"].filter(Boolean).join(" · ");
    item.append(title, meta);
    dashboardTodayTasks.appendChild(item);
  });
}

function renderDashboardWeather(snapshot) {
  if (!snapshot) return;
  dashboardWeatherIcon.textContent = snapshot.icon || "☁";
  dashboardWeatherCity.textContent = snapshot.city;
  dashboardWeatherDetail.textContent = snapshot.temperature + "°C · " + snapshot.description;
  dashboardWeatherUpdated.textContent = "Updated " + new Date(snapshot.savedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

try {
  const savedWeather = localStorage.getItem("studydesk-weather-snapshot");
  if (savedWeather) renderDashboardWeather(JSON.parse(savedWeather));
} catch (error) {}

window.addEventListener("studydesk-weather-updated", function (event) {
  renderDashboardWeather(event.detail);
});

async function loadDashboard() {
  dashboardStats.innerHTML = "";
  dashboardStats.appendChild(Object.assign(document.createElement("p"), {
    className: "empty-text",
    textContent: "Loading your overview..."
  }));

  try {
    const responses = await Promise.all([
      apiFetch("/api/tasks"),
      apiFetch("/api/assignments"),
      apiFetch("/api/expenses")
    ]);
    if (responses.some(function (response) { return !response.ok; })) {
      throw new Error("Could not load overview data");
    }

    const [tasks, assignments, expenses] = await Promise.all(
      responses.map(function (response) { return response.json(); })
    );
    const openTasks = tasks.filter(function (task) { return !task.done; }).length;
    const now = new Date();
    const todayKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    const tasksDueToday = tasks.filter(function (task) { return !task.done && task.due_date === todayKey; });
    const pendingAssignments = assignments.filter(function (item) {
      return item.status !== "Submitted";
    });
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekSpent = expenses.reduce(function (sum, expense) {
      if (!expense.created_at) return sum;
      const createdAt = new Date(expense.created_at.replace(" ", "T") + "Z");
      return !Number.isNaN(createdAt.getTime()) && createdAt >= weekStart && createdAt < weekEnd
        ? sum + Number(expense.amount)
        : sum;
    }, 0);
    let focusCount = 0;
    try {
      focusCount = Number(localStorage.getItem(
        "studydesk-pomo-" + now.toLocaleDateString("en-CA")
      )) || 0;
    } catch (e) {}

    dashboardStats.replaceChildren(
      makeDashboardStat("✓", "Tasks due today", String(tasksDueToday.length), openTasks + " open in total", "tasks", "violet"),
      makeDashboardStat("▣", "Assignments", String(pendingAssignments.length), "Still to submit", "assignments", "blue"),
      makeDashboardStat("↗", "Spent this week", "Rs " + Math.round(weekSpent).toLocaleString(), "Monday to Sunday", "expenses", "green"),
      makeDashboardStat("◷", "Focus sessions", String(focusCount), "Completed today", "pomodoro", "amber")
    );
    renderTodayTasks(tasks);

    const upcoming = pendingAssignments
      .filter(function (item) { return item.due_date; })
      .sort(function (a, b) { return a.due_date.localeCompare(b.due_date); })
      .slice(0, 4);
    dashboardUpcoming.replaceChildren();
    if (upcoming.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dashboard-empty";
      empty.textContent = pendingAssignments.length
        ? "No due dates set yet. Add one to keep track."
        : "You're all caught up. No pending assignments!";
      dashboardUpcoming.appendChild(empty);
    } else {
      upcoming.forEach(function (assignment) {
        dashboardUpcoming.appendChild(makeUpcomingItem(assignment));
      });
    }
  } catch (error) {
    dashboardStats.replaceChildren();
    dashboardUpcoming.replaceChildren();
    if (window.isStudyDeskOffline) {
      const cachedTasks = window.studyDeskUser ? (StudyCache.read(window.studyDeskUser, "tasks") || []) : [];
      const now = new Date();
      const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
      const dueToday = cachedTasks.filter(function (task) { return !task.done && task.due_date === today; }).length;
      let focusCount = 0;
      try {
        focusCount = Number(localStorage.getItem("studydesk-pomo-" + now.toLocaleDateString("en-CA"))) || 0;
      } catch (storageError) {}
      dashboardStats.replaceChildren(
        makeDashboardStat("✓", "Tasks due today", String(dueToday), "From your saved backup", "tasks", "violet"),
        makeDashboardStat("▣", "Assignments", "—", "Reconnect to load", "assignments", "blue"),
        makeDashboardStat("↗", "Spent this week", "—", "Reconnect to load", "expenses", "green"),
        makeDashboardStat("◷", "Focus sessions", String(focusCount), "Completed today", "pomodoro", "amber")
      );
      renderTodayTasks(cachedTasks);
      const offlineMessage = document.createElement("p");
      offlineMessage.className = "dashboard-empty";
      offlineMessage.textContent = "Assignments aur kharchay dekhne ke liye server se reconnect karein.";
      dashboardUpcoming.appendChild(offlineMessage);
    } else {
      const message = document.createElement("p");
      message.className = "dashboard-empty";
      message.textContent = "Overview load nahi hua. Page refresh karke dobara try karein.";
      dashboardStats.appendChild(message);
      dashboardTodayTasks.replaceChildren();
    }
  }
}

document.querySelectorAll("[data-go]").forEach(function (button) {
  button.addEventListener("click", function () {
    const target = button.dataset.go;
    document.querySelector('.tab[data-section="' + target + '"]').click();
  });
});
