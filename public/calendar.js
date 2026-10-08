// ---------- Study deadline calendar ----------
const calendarMonthLabel = document.getElementById("calendarMonth");
const calendarGrid = document.getElementById("calendarGrid");
const calendarWeekdays = document.getElementById("calendarWeekdays");
const calendarAgenda = document.getElementById("calendarAgenda");
const calendarAgendaTitle = document.getElementById("calendarAgendaTitle");
const calendarTodayButton = document.getElementById("calendarToday");

let calendarMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedDate = localDateKey(new Date());
let calendarEvents = [];

function localDateKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
    "-" + String(date.getDate()).padStart(2, "0");
}

async function loadCalendar() {
  try {
    const responses = await Promise.all([apiFetch("/api/tasks"), apiFetch("/api/assignments")]);
    if (responses.some(function (response) { return !response.ok; })) return;
    const [tasks, assignments] = await Promise.all(
      responses.map(function (response) { return response.json(); })
    );
    calendarEvents = [];
    tasks.forEach(function (task) {
      if (!task.due_date) return;
      calendarEvents.push({
        type: "task",
        title: task.text,
        date: task.due_date,
        detail: (task.priority === "Normal" ? "Medium" : (task.priority || "Medium")) + " priority" + (task.done ? " · completed" : ""),
        completed: Boolean(task.done)
      });
    });
    assignments.forEach(function (assignment) {
      if (!assignment.due_date) return;
      calendarEvents.push({
        type: "assignment",
        title: assignment.title,
        date: assignment.due_date,
        detail: assignment.subject + " · " + assignment.status,
        completed: assignment.status === "Submitted"
      });
    });
    renderCalendar();
  } catch (error) {
    calendarGrid.textContent = "Could not load calendar items. Please refresh.";
  }
}

function renderCalendar() {
  calendarMonthLabel.textContent = calendarMonthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  calendarWeekdays.replaceChildren();
  const sunday = new Date(2024, 0, 7);
  for (let day = 0; day < 7; day += 1) {
    const label = document.createElement("span");
    label.textContent = new Date(2024, 0, 7 + day).toLocaleDateString(undefined, { weekday: "short" });
    calendarWeekdays.appendChild(label);
  }

  calendarGrid.replaceChildren();
  const year = calendarMonthDate.getFullYear();
  const month = calendarMonthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = localDateKey(new Date());

  for (let blank = 0; blank < firstWeekday; blank += 1) {
    const empty = document.createElement("div");
    empty.className = "calendar-blank";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = localDateKey(date);
    const events = calendarEvents.filter(function (event) { return event.date === key; });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (key === today) button.classList.add("is-today");
    if (key === calendarSelectedDate) button.classList.add("is-selected");

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day);
    button.appendChild(number);

    const dots = document.createElement("span");
    dots.className = "calendar-day-dots";
    events.slice(0, 3).forEach(function (event) {
      const dot = document.createElement("i");
      dot.className = event.type + "-dot" + (event.completed ? " completed" : "");
      dots.appendChild(dot);
    });
    if (events.length > 3) {
      const more = document.createElement("small");
      more.textContent = "+" + (events.length - 3);
      dots.appendChild(more);
    }
    button.appendChild(dots);
    button.addEventListener("click", function () {
      calendarSelectedDate = key;
      renderCalendar();
    });
    calendarGrid.appendChild(button);
  }

  renderCalendarAgenda();
}

function renderCalendarAgenda() {
  const date = new Date(calendarSelectedDate + "T00:00:00");
  calendarAgendaTitle.textContent = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  calendarAgenda.replaceChildren();

  const events = calendarEvents.filter(function (event) { return event.date === calendarSelectedDate; });
  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = "No tasks or assignments due on this day.";
    calendarAgenda.appendChild(empty);
    return;
  }

  events.forEach(function (event) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "calendar-agenda-item " + event.type + (event.completed ? " is-complete" : "");

    const marker = document.createElement("span");
    marker.className = "calendar-agenda-marker " + event.type + "-dot";
    marker.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "calendar-agenda-copy";
    const title = document.createElement("strong");
    title.textContent = event.title;
    const detail = document.createElement("small");
    detail.textContent = (event.type === "task" ? "Task" : "Assignment") + " · " + event.detail;
    text.append(title, detail);

    const arrow = document.createElement("span");
    arrow.className = "calendar-agenda-arrow";
    arrow.textContent = "›";
    item.append(marker, text, arrow);
    item.addEventListener("click", function () {
      const tabName = event.type === "task" ? "tasks" : "assignments";
      const tab = document.querySelector('.tab[data-section="' + tabName + '"]');
      if (tab) tab.click();
    });
    calendarAgenda.appendChild(item);
  });
}

document.getElementById("calendarPrev").addEventListener("click", function () {
  calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() - 1, 1);
  calendarSelectedDate = localDateKey(calendarMonthDate);
  renderCalendar();
});

document.getElementById("calendarNext").addEventListener("click", function () {
  calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 1);
  calendarSelectedDate = localDateKey(calendarMonthDate);
  renderCalendar();
});

calendarTodayButton.addEventListener("click", function () {
  const today = new Date();
  calendarMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarSelectedDate = localDateKey(today);
  renderCalendar();
});

document.querySelector('.tab[data-section="calendar"]').addEventListener("click", loadCalendar);
