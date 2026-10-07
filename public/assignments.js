// ---------- Assignments ----------
const asgSubject = document.getElementById("asgSubject");
const asgTitle = document.getElementById("asgTitle");
const asgDue = document.getElementById("asgDue");
const asgAddBtn = document.getElementById("asgAddBtn");
const asgCancelBtn = document.getElementById("asgCancelBtn");
const asgSearch = document.getElementById("asgSearch");
const asgStatusFilter = document.getElementById("asgStatusFilter");
const asgList = document.getElementById("asgList");

const STATUSES = ["Not started", "In progress", "Submitted"];
let allAssignments = [];
let editingAssignmentId = null;

function daysLeft(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

function dueInfo(a) {
  if (a.due_date === "") return { text: "No due date", cls: "" };
  if (a.status === "Submitted") {
    return { text: "Submitted ✅ (due " + a.due_date + ")", cls: "due-done" };
  }

  const d = daysLeft(a.due_date);
  if (d < 0) return { text: "Late by " + Math.abs(d) + " day(s)", cls: "due-late" };
  if (d === 0) return { text: "Due today!", cls: "due-soon" };
  if (d <= 3) return { text: d + " day(s) left", cls: "due-soon" };
  return { text: d + " days left (" + a.due_date + ")", cls: "" };
}

function resetAssignmentForm() {
  editingAssignmentId = null;
  asgSubject.value = "";
  asgTitle.value = "";
  asgDue.value = "";
  asgAddBtn.textContent = "Add";
  asgCancelBtn.style.display = "none";
}

async function updateAssignment(id, status, marks) {
  const res = await apiFetch("/api/assignments/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status, marks: marks })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not update the assignment");
    return;
  }
  await loadAssignments();
  loadDashboard();
}

async function loadAssignments() {
  const res = await apiFetch("/api/assignments");
  if (!res.ok) return;
  allAssignments = await res.json();
  renderAssignments();
}

function renderAssignments() {
  const query = asgSearch.value.trim().toLowerCase();
  const status = asgStatusFilter.value;
  const items = allAssignments.filter(function (item) {
    const matchesQuery = (item.title + " " + item.subject).toLowerCase().includes(query);
    const matchesStatus = status === "all" || item.status === status;
    return matchesQuery && matchesStatus;
  });

  asgList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = allAssignments.length
      ? "No assignments match your search or filter."
      : "No assignments yet. Add your first one above!";
    asgList.appendChild(empty);
    return;
  }

  items.forEach(function (a) {
    const card = document.createElement("div");
    card.className = "asg-card";

    const top = document.createElement("div");
    top.className = "asg-top";

    const badge = document.createElement("span");
    badge.className = "asg-subject";
    badge.textContent = a.subject;

    const actions = document.createElement("div");
    actions.className = "asg-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "asg-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      editingAssignmentId = a.id;
      asgSubject.value = a.subject;
      asgTitle.value = a.title;
      asgDue.value = a.due_date || "";
      asgAddBtn.textContent = "Save changes";
      asgCancelBtn.style.display = "inline-block";
      asgSubject.focus();
      document.querySelector("#assignments .add-row").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const delBtn = document.createElement("button");
    delBtn.className = "asg-del";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      const res = await apiFetch("/api/assignments/" + a.id, { method: "DELETE" });
      if (!res.ok) return;
      await loadAssignments();
      loadDashboard();
    });

    actions.append(editBtn, delBtn);
    top.append(badge, actions);

    const title = document.createElement("div");
    title.className = "asg-title";
    title.textContent = a.title;

    const info = dueInfo(a);
    const due = document.createElement("div");
    due.className = "asg-due " + info.cls;
    due.textContent = info.text;

    const controls = document.createElement("div");
    controls.className = "asg-controls";

    const select = document.createElement("select");
    STATUSES.forEach(function (s) {
      const opt = document.createElement("option");
      opt.textContent = s;
      opt.value = s;
      opt.selected = s === a.status;
      select.appendChild(opt);
    });

    const marksInput = document.createElement("input");
    marksInput.type = "text";
    marksInput.placeholder = "Marks (e.g. 18/20)";
    marksInput.value = a.marks;

    select.addEventListener("change", function () {
      updateAssignment(a.id, select.value, marksInput.value);
    });
    marksInput.addEventListener("change", function () {
      updateAssignment(a.id, select.value, marksInput.value);
    });

    controls.append(select, marksInput);
    card.append(top, title, due, controls);
    asgList.appendChild(card);
  });
}

asgAddBtn.addEventListener("click", async function () {
  const subject = asgSubject.value.trim();
  const title = asgTitle.value.trim();
  if (subject === "" || title === "") {
    alert("Please write both the subject and the title");
    return;
  }

  const editing = editingAssignmentId !== null;
  const res = await apiFetch(
    editing ? "/api/assignments/" + editingAssignmentId : "/api/assignments",
    {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject, title: title, due_date: asgDue.value })
    }
  );

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not save the assignment");
    return;
  }

  resetAssignmentForm();
  await loadAssignments();
  loadDashboard();
});

asgCancelBtn.addEventListener("click", resetAssignmentForm);
asgSearch.addEventListener("input", renderAssignments);
asgStatusFilter.addEventListener("change", renderAssignments);
