// ---------- Class Timetable ----------
const classForm = document.getElementById("classForm");
const classSubject = document.getElementById("classSubject");
const classDay = document.getElementById("classDay");
const classStart = document.getElementById("classStart");
const classEnd = document.getElementById("classEnd");
const classRoom = document.getElementById("classRoom");
const classSave = document.getElementById("classSave");
const classCancel = document.getElementById("classCancel");
const classStatus = document.getElementById("classStatus");
const classGrid = document.getElementById("classGrid");
const classDays = [
  { id: 1, name: "Monday" }, { id: 2, name: "Tuesday" }, { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" }, { id: 5, name: "Friday" }, { id: 6, name: "Saturday" }, { id: 0, name: "Sunday" }
];
let classes = [];
let editingClassId = null;

function classTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function showClassStatus(message, isError) {
  classStatus.textContent = message;
  classStatus.classList.toggle("is-error", Boolean(isError));
  classStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderClasses() {
  classGrid.replaceChildren();
  const today = new Date().getDay();
  classDays.forEach(function (day) {
    const column = document.createElement("section");
    column.className = "class-day" + (day.id === today ? " is-today" : "");
    const heading = document.createElement("h3");
    heading.textContent = day.name;
    const entries = classes.filter(function (item) { return item.day_of_week === day.id; });
    const count = document.createElement("span");
    count.className = "class-count";
    count.textContent = String(entries.length);
    heading.appendChild(count);
    column.appendChild(heading);

    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "class-empty-day";
      empty.textContent = "No classes";
      column.appendChild(empty);
    }

    entries.forEach(function (item) {
      const card = document.createElement("article");
      card.className = "class-card";
      const title = document.createElement("strong");
      title.textContent = item.subject;
      const time = document.createElement("span");
      time.className = "class-time";
      time.textContent = classTime(item.start_time) + " – " + classTime(item.end_time);
      card.append(title, time);
      if (item.room) {
        const room = document.createElement("small");
        room.textContent = "Room: " + item.room;
        card.appendChild(room);
      }
      const actions = document.createElement("div");
      actions.className = "class-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.disabled = Boolean(window.isStudyDeskOffline);
      edit.addEventListener("click", function () {
        editingClassId = item.id;
        classSubject.value = item.subject;
        classDay.value = String(item.day_of_week);
        classStart.value = item.start_time;
        classEnd.value = item.end_time;
        classRoom.value = item.room || "";
        classSave.textContent = "Save changes";
        classCancel.hidden = false;
        classSubject.focus();
        classForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "class-delete";
      remove.textContent = "Delete";
      remove.disabled = Boolean(window.isStudyDeskOffline);
      remove.addEventListener("click", async function () {
        if (!window.confirm("Delete “" + item.subject + "” class?")) return;
        remove.disabled = true;
        try {
          const response = await apiFetch("/api/classes/" + item.id, { method: "DELETE" });
          if (!response.ok) throw new Error("Class delete nahi hui.");
          classes = classes.filter(function (entry) { return entry.id !== item.id; });
          renderClasses();
          showClassStatus("Class delete ho gayi.", false);
        } catch (error) {
          remove.disabled = false;
          showClassStatus(error.message || "Server se rabta nahi ho saka.", true);
        }
      });
      actions.append(edit, remove);
      card.appendChild(actions);
      column.appendChild(card);
    });
    classGrid.appendChild(column);
  });
}

async function loadClasses() {
  try {
    const response = await apiFetch("/api/classes");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Class Timetable API load nahi hui. Server restart karke page refresh karein."
      : "Class timetable load nahi hui.");
    classes = await response.json();
    renderClasses();
  } catch (error) {
    classGrid.textContent = error.message || "Internet/server connection check karein.";
  }
}

function resetClassForm() {
  editingClassId = null;
  classForm.reset();
  classDay.value = "1";
  classSave.textContent = "Add class";
  classCancel.hidden = true;
}

classForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const editing = editingClassId !== null;
  classSave.disabled = true;
  classSave.textContent = "Saving...";
  showClassStatus("", false);
  try {
    const response = await apiFetch(editing ? "/api/classes/" + editingClassId : "/api/classes", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: classSubject.value,
        day_of_week: Number(classDay.value),
        start_time: classStart.value,
        end_time: classEnd.value,
        room: classRoom.value
      })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(response.status === 409 ? "Is din aur waqt par pehle se class hai." : (data.error || "Class save nahi hui."));
    resetClassForm();
    await loadClasses();
    showClassStatus(editing ? "Class update ho gayi." : "Class save ho gayi.", false);
  } catch (error) {
    showClassStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    classSave.disabled = Boolean(window.isStudyDeskOffline);
    classSave.textContent = editingClassId !== null ? "Save changes" : "Add class";
  }
});

classCancel.addEventListener("click", resetClassForm);
window.addEventListener("studydesk:offline-change", function () {
  [classSubject, classDay, classStart, classEnd, classRoom, classSave, classCancel].forEach(function (control) {
    control.disabled = Boolean(window.isStudyDeskOffline);
  });
  renderClasses();
});
