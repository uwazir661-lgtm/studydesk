// ---------- Weekly Study Plan ----------
const studyPlanForm = document.getElementById("studyPlanForm");
const studyPlanSubject = document.getElementById("studyPlanSubject");
const studyPlanDay = document.getElementById("studyPlanDay");
const studyPlanStart = document.getElementById("studyPlanStart");
const studyPlanEnd = document.getElementById("studyPlanEnd");
const studyPlanGoal = document.getElementById("studyPlanGoal");
const studyPlanSave = document.getElementById("studyPlanSave");
const studyPlanCancel = document.getElementById("studyPlanCancel");
const studyPlanStatus = document.getElementById("studyPlanStatus");
const studyPlanGrid = document.getElementById("studyPlanGrid");

const studyPlanDays = [
  { id: 1, name: "Monday" }, { id: 2, name: "Tuesday" }, { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" }, { id: 5, name: "Friday" }, { id: 6, name: "Saturday" },
  { id: 0, name: "Sunday" }
];
let studyPlanBlocks = [];
let editingStudyBlockId = null;

function formatStudyTime(value) {
  const parts = value.split(":");
  const date = new Date();
  date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function showStudyPlanStatus(message, isError) {
  studyPlanStatus.textContent = message;
  studyPlanStatus.classList.toggle("is-error", Boolean(isError));
  studyPlanStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderStudyPlan() {
  studyPlanGrid.replaceChildren();
  const today = new Date().getDay();

  studyPlanDays.forEach(function (day) {
    const column = document.createElement("section");
    column.className = "study-plan-day" + (day.id === today ? " is-today" : "");
    const heading = document.createElement("h3");
    heading.textContent = day.name;
    const blocks = studyPlanBlocks.filter(function (block) { return block.day_of_week === day.id; });
    const count = document.createElement("span");
    count.className = "study-plan-count";
    count.textContent = blocks.length ? String(blocks.length) : "—";
    heading.appendChild(count);
    column.appendChild(heading);

    if (blocks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "study-plan-empty-day";
      empty.textContent = "No study blocks";
      column.appendChild(empty);
    }

    blocks.forEach(function (block) {
      const card = document.createElement("article");
      card.className = "study-plan-block";
      const subject = document.createElement("strong");
      subject.textContent = block.subject;
      const time = document.createElement("span");
      time.className = "study-plan-time";
      time.textContent = formatStudyTime(block.start_time) + " – " + formatStudyTime(block.end_time);
      card.append(subject, time);

      if (block.goal) {
        const goal = document.createElement("p");
        goal.textContent = block.goal;
        card.appendChild(goal);
      }

      const actions = document.createElement("div");
      actions.className = "study-plan-actions";
      const focus = document.createElement("button");
      focus.type = "button";
      focus.textContent = "Focus";
      focus.addEventListener("click", function () {
        document.querySelector('.tab[data-section="pomodoro"]').click();
        document.getElementById("pomoMessage").textContent = "Study " + block.subject + (block.goal ? ": " + block.goal : "");
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", function () {
        editingStudyBlockId = block.id;
        studyPlanSubject.value = block.subject;
        studyPlanDay.value = String(block.day_of_week);
        studyPlanStart.value = block.start_time;
        studyPlanEnd.value = block.end_time;
        studyPlanGoal.value = block.goal || "";
        studyPlanSave.textContent = "Save changes";
        studyPlanCancel.hidden = false;
        studyPlanSubject.focus();
        studyPlanForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "study-plan-delete";
      remove.textContent = "Delete";
      remove.addEventListener("click", async function () {
        if (!window.confirm("Delete this " + block.subject + " study block?")) return;
        remove.disabled = true;
        try {
          const response = await apiFetch("/api/study-plan/" + block.id, { method: "DELETE" });
          if (!response.ok) throw new Error("Study block delete nahi hua. Dobara try karein.");
          await loadStudyPlan();
          showStudyPlanStatus("Study block delete ho gaya.", false);
        } catch (error) {
          showStudyPlanStatus(error.message || "Server connection check karein.", true);
          remove.disabled = false;
        }
      });

      if (window.isStudyDeskOffline) [focus, edit, remove].forEach(function (button) { button.disabled = true; });
      actions.append(focus, edit, remove);
      card.appendChild(actions);
      column.appendChild(card);
    });

    studyPlanGrid.appendChild(column);
  });
}

async function loadStudyPlan() {
  try {
    const response = await apiFetch("/api/study-plan");
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Study plan load nahi ho saka.");
    studyPlanBlocks = await response.json();
    renderStudyPlan();
  } catch (error) {
    studyPlanGrid.replaceChildren();
    const message = document.createElement("p");
    message.className = "study-plan-empty-state";
    message.textContent = window.isStudyDeskOffline
      ? "Study timetable dekhne ke liye server se reconnect karein."
      : (error.message || "Study timetable load nahi ho saka.");
    studyPlanGrid.appendChild(message);
  }
}

function resetStudyPlanForm() {
  editingStudyBlockId = null;
  studyPlanForm.reset();
  studyPlanDay.value = "1";
  studyPlanSave.textContent = "Add study block";
  studyPlanCancel.hidden = true;
}

studyPlanForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const editing = editingStudyBlockId !== null;
  studyPlanSave.disabled = true;
  studyPlanSave.textContent = "Saving...";
  showStudyPlanStatus("", false);

  try {
    const response = await apiFetch(editing ? "/api/study-plan/" + editingStudyBlockId : "/api/study-plan", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: studyPlanSubject.value,
        day_of_week: Number(studyPlanDay.value),
        start_time: studyPlanStart.value,
        end_time: studyPlanEnd.value,
        goal: studyPlanGoal.value
      })
    });
    if (!response.ok) {
      const data = await response.json().catch(function () { return {}; });
      const message = response.status === 409
        ? "Is din is waqt par pehle se study block bana hua hai."
        : (response.status === 400
          ? (data.error && data.error.includes("End time") ? "End time, start time ke baad hona chahiye." : "Subject aur study block ki details check karein.")
          : (data.error || "Study block save nahi hua."));
      throw new Error(message);
    }
    resetStudyPlanForm();
    await loadStudyPlan();
    showStudyPlanStatus(editing ? "Study block update ho gaya." : "Study block add ho gaya.", false);
  } catch (error) {
    showStudyPlanStatus(error.message || "Server connection check karein.", true);
  } finally {
    studyPlanSave.disabled = false;
    studyPlanSave.textContent = editingStudyBlockId !== null ? "Save changes" : "Add study block";
  }
});

studyPlanCancel.addEventListener("click", resetStudyPlanForm);
window.addEventListener("studydesk:offline-change", renderStudyPlan);
