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

// Server se saare tasks lao aur screen par dikhao
async function loadTasks() {
  const res = await fetch("/api/tasks");
  const tasks = await res.json();

  taskList.innerHTML = "";

  tasks.forEach(function (task) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = task.text;
    if (task.done) {
      span.classList.add("done");
    }

    // Click par complete / incomplete
    span.addEventListener("click", async function () {
      await fetch("/api/tasks/" + task.id, { method: "PUT" });
      loadTasks();
    });

    // Delete button
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

// Naya task add karo
addBtn.addEventListener("click", async function () {
  const text = taskInput.value.trim();

  if (text === "") {
    return;
  }

  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text })
  });

  taskInput.value = "";
  loadTasks();
});

// Page khulte hi tasks load karo

// ---------- Expenses ----------
const expTitle = document.getElementById("expTitle");
const expAmount = document.getElementById("expAmount");
const expCategory = document.getElementById("expCategory");
const expAddBtn = document.getElementById("expAddBtn");
const expList = document.getElementById("expList");
const expTotal = document.getElementById("expTotal");

async function loadExpenses() {
  const res = await fetch("/api/expenses");
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

  await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title,
      amount: amount,
      category: expCategory.value
    })
  });

  expTitle.value = "";
  expAmount.value = "";
  loadExpenses();
});

