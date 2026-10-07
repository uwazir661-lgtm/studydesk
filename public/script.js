// ---------- Tabs ----------
const tabs = document.querySelectorAll(".tab");
const sections = document.querySelectorAll(".section");

tabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    tabs.forEach(function (t) { t.classList.remove("active"); });
    sections.forEach(function (s) { s.classList.remove("active"); });

    tab.classList.add("active");
    document.getElementById(tab.dataset.section).classList.add("active");
    document.querySelectorAll(".nav-dropdown").forEach(function (menu) {
      menu.classList.remove("has-active");
      menu.open = false;
    });
    const activeMenu = tab.closest(".nav-dropdown");
    if (activeMenu) activeMenu.classList.add("has-active");
  });
});

document.querySelectorAll(".nav-dropdown").forEach(function (menu) {
  menu.addEventListener("toggle", function () {
    if (!menu.open) return;
    document.querySelectorAll(".nav-dropdown").forEach(function (otherMenu) {
      if (otherMenu !== menu) otherMenu.open = false;
    });
  });
});

// ---------- Tasks ----------
const taskInput = document.getElementById("taskInput");
const taskSubject = document.getElementById("taskSubject");
const taskPriority = document.getElementById("taskPriority");
const taskDue = document.getElementById("taskDue");
const taskRepeat = document.getElementById("taskRepeat");
const addBtn = document.getElementById("addBtn");
const taskCancelBtn = document.getElementById("taskCancelBtn");
const taskSearch = document.getElementById("taskSearch");
const taskFilter = document.getElementById("taskFilter");
const taskList = document.getElementById("taskList");
let allTasks = [];
let editingTaskId = null;

async function loadTasks() {
  try {
    const res = await apiFetch("/api/tasks");
    if (res.status === 401) return;
    if (!res.ok) throw new Error("Tasks could not be loaded");
    allTasks = await res.json();
    if (window.studyDeskUser) StudyCache.save(window.studyDeskUser, "tasks", allTasks);
  } catch (error) {
    if (typeof window.setStudyDeskOffline === "function") window.setStudyDeskOffline();
    allTasks = window.studyDeskUser ? (StudyCache.read(window.studyDeskUser, "tasks") || []) : [];
  }
  renderTasks();
}

function renderTasks() {
  const query = taskSearch.value.trim().toLowerCase();
  const filter = taskFilter.value;
  taskList.innerHTML = "";

  const tasks = allTasks.filter(function (task) {
    const matchesQuery = task.text.toLowerCase().includes(query) || (task.subject || "").toLowerCase().includes(query);
    const matchesFilter = filter === "all" || (filter === "done" ? Boolean(task.done) : !task.done);
    return matchesQuery && matchesFilter;
  });

  if (tasks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-empty";
    empty.textContent = allTasks.length
      ? "No tasks match your search or filter."
      : (window.isStudyDeskOffline ? "Is browser mein koi saved task backup nahi mila." : "No tasks yet. Add one above!");
    taskList.appendChild(empty);
  }

  tasks.forEach(function (task) {
    const li = document.createElement("li");
    li.classList.toggle("task-completed", Boolean(task.done));

    const main = document.createElement("div");
    main.className = "task-main";

    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;
    if (task.done) {
      span.classList.add("done");
    }

    const details = document.createElement("div");
    details.className = "task-details";
    if (task.subject) {
      const subject = document.createElement("span");
      subject.className = "task-subject";
      subject.textContent = task.subject;
      details.appendChild(subject);
    }
    const priority = document.createElement("span");
    priority.className = "task-priority priority-" + (task.priority || "Normal").toLowerCase();
    priority.textContent = (task.priority === "Normal" ? "Medium" : (task.priority || "Medium")) + " priority";
    details.appendChild(priority);
    if (task.recurrence && task.recurrence !== "none") {
      const repeat = document.createElement("span");
      repeat.className = "task-repeat";
      repeat.textContent = task.recurrence === "daily" ? "Repeats daily" : "Repeats weekly";
      details.appendChild(repeat);
    }
    if (task.due_date) {
      const due = document.createElement("span");
      due.className = "task-due";
      const date = new Date(task.due_date + "T00:00:00");
      const late = !task.done && date < new Date(new Date().setHours(0, 0, 0, 0));
      due.textContent = (late ? "Overdue · " : "Due · ") + date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (late) due.classList.add("task-overdue");
      details.appendChild(due);
    }
    main.append(span, details);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const completeBtn = document.createElement("button");
    completeBtn.className = "task-complete-btn";
    const isRecurring = task.recurrence && task.recurrence !== "none";
    completeBtn.textContent = task.done ? (isRecurring ? "Done" : "Undo") : (isRecurring ? "Complete & repeat" : "Complete");
    completeBtn.disabled = Boolean(task.done && isRecurring);
    completeBtn.addEventListener("click", async function () {
      completeBtn.disabled = true;
      try {
        const response = await apiFetch("/api/tasks/" + task.id, { method: "PUT" });
        if (!response.ok) throw new Error("Task update nahi hua. Dobara try karein.");
        const result = await response.json().catch(function () { return {}; });
        if (result.next_due_date) {
          const nextDate = new Date(result.next_due_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
          alert("Task complete! Agla repeat " + nextDate + " ko due hoga.");
        }
      } catch (error) {
        alert(error.message || "Task update nahi hua.");
      }
      await loadTasks();
      loadDashboard();
    });

    const editBtn = document.createElement("button");
    editBtn.className = "task-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      editingTaskId = task.id;
      taskInput.value = task.text;
      taskSubject.value = task.subject || "";
      taskPriority.value = task.priority || "Normal";
      taskDue.value = task.due_date || "";
      taskRepeat.value = task.recurrence || "none";
      addBtn.textContent = "Save changes";
      taskCancelBtn.style.display = "inline-block";
      taskInput.focus();
      document.querySelector("#tasks .add-row").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const delBtn = document.createElement("button");
    delBtn.className = "task-delete-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      await apiFetch("/api/tasks/" + task.id, { method: "DELETE" });
      await loadTasks();
      loadDashboard();
    });

    if (window.isStudyDeskOffline) {
      [completeBtn, editBtn, delBtn].forEach(function (button) {
        button.disabled = true;
        button.title = "Reconnect to the server to edit tasks";
      });
    }

    actions.append(completeBtn, editBtn, delBtn);
    li.append(main, actions);
    taskList.appendChild(li);
  });
}

function resetTaskForm() {
  editingTaskId = null;
  taskInput.value = "";
  taskSubject.value = "";
  taskPriority.value = "Normal";
  taskDue.value = "";
  taskRepeat.value = "none";
  addBtn.textContent = "Add";
  taskCancelBtn.style.display = "none";
}

addBtn.addEventListener("click", async function () {
  const text = taskInput.value.trim();

  if (text === "") {
    return;
  }

  const editing = editingTaskId !== null;
  addBtn.disabled = true;
  addBtn.setAttribute("aria-busy", "true");
  addBtn.textContent = "Saving...";
  try {
    const res = await apiFetch(editing ? "/api/tasks/" + editingTaskId : "/api/tasks", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, subject: taskSubject.value.trim(), priority: taskPriority.value, due_date: taskDue.value, recurrence: taskRepeat.value })
    });

    if (!res.ok) {
      const data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || "Task save nahi hua. Dobara try karein.");
    }

    resetTaskForm();
    await loadTasks();
    loadDashboard();
  } catch (error) {
    alert(error.name === "TypeError" ? "Server se rabta nahi ho saka. Internet check karein." : (error.message || "Task save nahi hua."));
  } finally {
    addBtn.disabled = false;
    addBtn.removeAttribute("aria-busy");
    addBtn.textContent = editingTaskId !== null ? "Save changes" : "Add";
  }
});

taskInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    addBtn.click();
  }
});

taskSubject.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    addBtn.click();
  }
});

taskCancelBtn.addEventListener("click", resetTaskForm);
taskSearch.addEventListener("input", renderTasks);
taskFilter.addEventListener("change", renderTasks);

// ---------- Expenses ----------
const expTitle = document.getElementById("expTitle");
const expAmount = document.getElementById("expAmount");
const expCategory = document.getElementById("expCategory");
const expAddBtn = document.getElementById("expAddBtn");
const expCancelBtn = document.getElementById("expCancelBtn");
const expSearch = document.getElementById("expSearch");
const expFilter = document.getElementById("expFilter");
const expList = document.getElementById("expList");
const expTotal = document.getElementById("expTotal");
const expMonthTotal = document.getElementById("expMonthTotal");
const expMonthLabel = document.getElementById("expMonthLabel");
const expenseChart = document.getElementById("expenseChart");
let allExpenses = [];
let editingExpenseId = null;

async function loadExpenses() {
  const res = await apiFetch("/api/expenses");
  if (!res.ok) {
    return;
  }
  allExpenses = await res.json();
  renderExpenses();
}

function renderExpenses() {
  const query = expSearch.value.trim().toLowerCase();
  const category = expFilter.value;
  const expenses = allExpenses.filter(function (expense) {
    return expense.title.toLowerCase().includes(query) &&
      (category === "all" || expense.category === category);
  });
  expList.innerHTML = "";
  let total = 0;

  if (expenses.length === 0) {
    const empty = document.createElement("li");
    empty.className = "task-empty";
    empty.textContent = allExpenses.length ? "No expenses match your search or category." : "No expenses yet. Add one above!";
    expList.appendChild(empty);
  }

  expenses.forEach(function (exp) {
    total += Number(exp.amount) || 0;

    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = exp.title + " (" + exp.category + ") - Rs " + exp.amount;

    const actions = document.createElement("div");
    actions.className = "expense-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "expense-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () {
      editingExpenseId = exp.id;
      expTitle.value = exp.title;
      expAmount.value = exp.amount;
      expCategory.value = exp.category;
      expAddBtn.textContent = "Save changes";
      expCancelBtn.style.display = "inline-block";
      expTitle.focus();
      document.querySelector("#expenses .add-row").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const delBtn = document.createElement("button");
    delBtn.className = "expense-delete-btn";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      if (!window.confirm('"' + exp.title + '" kharcha delete karna pakka hai?')) return;
      delBtn.disabled = true;
      try {
        const res = await apiFetch("/api/expenses/" + exp.id, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(function () { return {}; });
          throw new Error(data.error || "Kharcha delete nahi ho saka. Dobara try karein.");
        }
        await loadExpenses();
        loadDashboard();
        loadBudgets();
      } catch (error) {
        alert(error.message || "Internet check karein aur dobara try karein.");
        delBtn.disabled = false;
      }
    });

    actions.append(editBtn, delBtn);
    li.append(span, actions);
    expList.appendChild(li);
  });

  expTotal.textContent = Math.round(total).toLocaleString();

  const now = new Date();
  expMonthLabel.textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const monthExpenses = allExpenses.filter(function (expense) {
    if (!expense.created_at) return false;
    const createdAt = new Date(expense.created_at.replace(" ", "T") + "Z");
    return !Number.isNaN(createdAt.getTime()) &&
      createdAt.getFullYear() === now.getFullYear() &&
      createdAt.getMonth() === now.getMonth();
  });
  const monthTotal = monthExpenses.reduce(function (sum, expense) {
    return sum + (Number(expense.amount) || 0);
  }, 0);
  expMonthTotal.textContent = Math.round(monthTotal).toLocaleString();
  renderExpenseChart(monthExpenses);
}

function renderExpenseChart(monthExpenses) {
  const categories = ["Food", "Transport", "Study", "Other"];
  const totals = categories.map(function (category) {
    return monthExpenses.reduce(function (sum, expense) {
      return sum + (expense.category === category ? (Number(expense.amount) || 0) : 0);
    }, 0);
  });
  const maxTotal = Math.max.apply(null, totals);
  expenseChart.innerHTML = "";
  expenseChart.setAttribute("aria-label", categories.map(function (category, index) {
    return category + ": Rs " + Math.round(totals[index]).toLocaleString();
  }).join("; "));

  if (maxTotal === 0) {
    const empty = document.createElement("p");
    empty.className = "expense-chart-empty";
    empty.textContent = "Is mahine ka category chart dikhane ke liye abhi kharcha nahi hai.";
    expenseChart.appendChild(empty);
    return;
  }

  categories.forEach(function (category, index) {
    const row = document.createElement("div");
    row.className = "expense-chart-row";
    const label = document.createElement("span");
    label.className = "expense-chart-category";
    label.textContent = category;
    const track = document.createElement("div");
    track.className = "expense-chart-track";
    const fill = document.createElement("div");
    fill.className = "expense-chart-fill category-" + category.toLowerCase();
    fill.style.width = maxTotal ? (totals[index] / maxTotal * 100) + "%" : "0%";
    track.appendChild(fill);
    const amount = document.createElement("strong");
    amount.className = "expense-chart-amount";
    amount.textContent = "Rs " + Math.round(totals[index]).toLocaleString();
    row.append(label, track, amount);
    expenseChart.appendChild(row);
  });
}

function resetExpenseForm() {
  editingExpenseId = null;
  expTitle.value = "";
  expAmount.value = "";
  expCategory.value = "Food";
  expAddBtn.textContent = "Add";
  expCancelBtn.style.display = "none";
}

expAddBtn.addEventListener("click", async function () {
  const title = expTitle.value.trim();
  const amount = expAmount.value;

  if (title === "" || amount === "") {
    return;
  }

  const editing = editingExpenseId !== null;
  expAddBtn.disabled = true;
  expAddBtn.setAttribute("aria-busy", "true");
  expAddBtn.textContent = "Saving...";
  try {
    const res = await apiFetch(editing ? "/api/expenses/" + editingExpenseId : "/api/expenses", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
        amount: amount,
        category: expCategory.value
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || "Expense save nahi hua. Dobara try karein.");
    }

    resetExpenseForm();
    await loadExpenses();
    loadDashboard();
    loadBudgets();
  } catch (error) {
    alert(error.name === "TypeError" ? "Server se rabta nahi ho saka. Internet check karein." : (error.message || "Expense save nahi hua."));
  } finally {
    expAddBtn.disabled = false;
    expAddBtn.removeAttribute("aria-busy");
    expAddBtn.textContent = editingExpenseId !== null ? "Save changes" : "Add";
  }
});

function addExpenseOnEnter(event) {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    expAddBtn.click();
  }
}

expTitle.addEventListener("keydown", addExpenseOnEnter);
expAmount.addEventListener("keydown", addExpenseOnEnter);

expCancelBtn.addEventListener("click", resetExpenseForm);
expSearch.addEventListener("input", renderExpenses);
expFilter.addEventListener("change", renderExpenses);
