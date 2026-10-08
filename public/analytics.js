// ---------- Study Analytics ----------
const analyticsStats = document.getElementById("analyticsStats");
const analyticsChart = document.getElementById("analyticsChart");
const analyticsStatus = document.getElementById("analyticsStatus");
const analyticsRefresh = document.getElementById("analyticsRefresh");

function focusTimeLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return minutes + " min";
  return remaining ? hours + "h " + remaining + "m" : hours + "h";
}

function makeAnalyticsStat(icon, label, value, hint, color) {
  const card = document.createElement("article");
  card.className = "analytics-stat " + color;
  const symbol = document.createElement("span");
  symbol.className = "analytics-stat-icon";
  symbol.textContent = icon;
  const title = document.createElement("span");
  title.className = "analytics-stat-label";
  title.textContent = label;
  const number = document.createElement("strong");
  number.textContent = value;
  const detail = document.createElement("small");
  detail.textContent = hint;
  card.append(symbol, title, number, detail);
  return card;
}

function renderAnalytics(data) {
  analyticsStats.replaceChildren(
    makeAnalyticsStat("⏱", "Focus this week", focusTimeLabel(data.week_focus_minutes),
      focusTimeLabel(data.today_focus_minutes) + " today", "violet"),
    makeAnalyticsStat("✓", "Tasks completed", String(data.week_tasks_completed), "In the last 7 days", "blue"),
    makeAnalyticsStat("🔥", "Study streak", String(data.streak_days) + (data.streak_days === 1 ? " day" : " days"),
      "Days with focus or completed tasks", "amber")
  );

  analyticsChart.replaceChildren();
  const maxMinutes = Math.max(1, ...data.daily.map(function (day) { return day.focus_minutes; }));
  data.daily.forEach(function (day) {
    const column = document.createElement("div");
    column.className = "analytics-day";
    const minutes = document.createElement("strong");
    minutes.textContent = day.focus_minutes ? focusTimeLabel(day.focus_minutes) : "—";
    const track = document.createElement("div");
    track.className = "analytics-bar-track";
    const bar = document.createElement("span");
    const height = day.focus_minutes ? Math.max(6, Math.round((day.focus_minutes / maxMinutes) * 100)) : 3;
    bar.style.height = height + "%";
    track.appendChild(bar);
    const label = document.createElement("span");
    const date = new Date(day.date + "T00:00:00");
    label.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
    const tasks = document.createElement("small");
    tasks.textContent = day.tasks_completed + (day.tasks_completed === 1 ? " task" : " tasks");
    column.append(minutes, track, label, tasks);
    analyticsChart.appendChild(column);
  });
}

async function loadAnalytics() {
  try {
    const response = await apiFetch("/api/analytics");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Study Analytics API load nahi hui. Server restart karke page refresh karein."
      : "Study analytics load nahi hui.");
    renderAnalytics(await response.json());
    analyticsStatus.textContent = "";
  } catch (error) {
    analyticsStatus.textContent = window.isStudyDeskOffline
      ? "Naye analytics dekhne ke liye server se reconnect karein."
      : (error.message || "Internet/server connection check karein.");
    analyticsStats.replaceChildren();
    analyticsChart.replaceChildren();
  }
}

analyticsRefresh.addEventListener("click", loadAnalytics);
