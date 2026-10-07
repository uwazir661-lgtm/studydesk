// ---------- Tabs ----------
const tabs = document.querySelectorAll(".tab");
const sections = document.querySelectorAll(".section");

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    tabs.forEach(function (t) { t.classList.remove("active"); });
    sections.forEach(function (s) { s.classList.remove("active"); });

    tab.classList.add("active");
    document.getElementById(tab.dataset.section).classList.add("active");
  });
});

// ---------- Tasks ----------
const taskInput = document.getElementById("taskInput");
const addBtn = document.getElementById("addBtn");
const taskList = document.getElementById("taskList");

async function loadTasks() {
  const res = await fetch("/api/tasks");
  if (!res.ok) {
    return;
  }
  const tasks = await res.json();

  taskList.innerHTML = "";

  tasks.forEach(function (task) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = task.text;
    if (task.done) {
      span.classList.add("done");
    }

    span.addEventListener("click", async function () {
      await fetch("/api/tasks/" + task.id, { method: "PUT" });
      loadTasks();
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      await fetch("/api/tasks/" + task.id, { method: "DELETE" });
      loadTasks();
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    taskList.appendChild(li);
  });
}

addBtn.addEventListener("click", async function () {
  const text = taskInput.value.trim();

  if (text === "") {
    return;
  }

  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not add the task");
    return;
  }

  taskInput.value = "";
  loadTasks();
});

// ---------- Expenses ----------
const expTitle = document.getElementById("expTitle");
const expAmount = document.getElementById("expAmount");
const expCategory = document.getElementById("expCategory");
const expAddBtn = document.getElementById("expAddBtn");
const expList = document.getElementById("expList");
const expTotal = document.getElementById("expTotal");

async function loadExpenses() {
  const res = await fetch("/api/expenses");
  if (!res.ok) {
    return;
  }
  const expenses = await res.json();

  expList.innerHTML = "";
  let total = 0;

  expenses.forEach(function (exp) {
    total += exp.amount;

    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = exp.title + " (" + exp.category + ") - Rs " + exp.amount;

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      await fetch("/api/expenses/" + exp.id, { method: "DELETE" });
      loadExpenses();
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    expList.appendChild(li);
  });

  expTotal.textContent = total;
}

expAddBtn.addEventListener("click", async function () {
  const title = expTitle.value.trim();
  const amount = expAmount.value;

  if (title === "" || amount === "") {
    return;
  }

  const res = await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title,
      amount: amount,
      category: expCategory.value
    })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not add the expense");
    return;
  }

  expTitle.value = "";
  expAmount.value = "";
  loadExpenses();
});

// ---------- Notes ----------
const noteTitle = document.getElementById("noteTitle");
const noteContent = document.getElementById("noteContent");
const noteSaveBtn = document.getElementById("noteSaveBtn");
const noteCancelBtn = document.getElementById("noteCancelBtn");
const noteSearch = document.getElementById("noteSearch");
const noteList = document.getElementById("noteList");

let allNotes = [];
let editingId = null;

async function loadNotes() {
  const res = await fetch("/api/notes");
  if (!res.ok) {
    return;
  }
  allNotes = await res.json();
  showNotes();
}

function showNotes() {
  const query = noteSearch.value.toLowerCase();

  const filtered = allNotes.filter(function (n) {
    return (
      n.title.toLowerCase().includes(query) ||
      n.content.toLowerCase().includes(query)
    );
  });

  noteList.innerHTML = "";

  filtered.forEach(function (note) {
    const card = document.createElement("div");
    card.className = "note-card";

    const h = document.createElement("h4");
    h.textContent = note.title;

    const p = document.createElement("p");
    p.textContent = note.content;

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.className = "note-edit";
    editBtn.addEventListener("click", function () {
      editingId = note.id;
      noteTitle.value = note.title;
      noteContent.value = note.content;
      noteSaveBtn.textContent = "Update";
      noteCancelBtn.style.display = "inline-block";
      noteTitle.focus();
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "note-del";
    delBtn.addEventListener("click", async function () {
      await fetch("/api/notes/" + note.id, { method: "DELETE" });
      loadNotes();
    });

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(editBtn);
    card.appendChild(delBtn);
    noteList.appendChild(card);
  });
}

function resetNoteForm() {
  editingId = null;
  noteTitle.value = "";
  noteContent.value = "";
  noteSaveBtn.textContent = "Save";
  noteCancelBtn.style.display = "none";
}

noteSaveBtn.addEventListener("click", async function () {
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();

  if (title === "") {
    alert("Please write a title first");
    return;
  }

  const url = editingId ? "/api/notes/" + editingId : "/api/notes";
  const method = editingId ? "PUT" : "POST";

  const res = await fetch(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, content: content })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not save the note");
    return;
  }

  resetNoteForm();
  loadNotes();
});

noteCancelBtn.addEventListener("click", resetNoteForm);
noteSearch.addEventListener("input", showNotes);