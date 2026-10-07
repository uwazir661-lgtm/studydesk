// ---------- Monthly Budget ----------
const budgetSummary = document.getElementById("budgetSummary");
const budgetList = document.getElementById("budgetList");
const budgetTab = document.querySelector('.tab[data-section="budget"]');

async function saveBudget(category, amount) {
  const res = await fetch("/api/budgets/" + encodeURIComponent(category), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amount === "" ? 0 : amount })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not save the budget");
    return;
  }

  loadBudgets();
}

async function loadBudgets() {
  const res = await fetch("/api/budgets");
  if (!res.ok) {
    return;
  }
  const items = await res.json();

  // Poore mahine ka total
  let totalBudget = 0;
  let totalSpent = 0;
  items.forEach(function (i) {
    totalBudget += i.budget;
    totalSpent += i.spent;
  });

  const monthName = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric"
  });

  budgetSummary.textContent =
    monthName +
    ": Rs " +
    Math.round(totalSpent) +
    " spent" +
    (totalBudget > 0 ? " of Rs " + Math.round(totalBudget) + " budget" : "");

  budgetList.innerHTML = "";

  items.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "budget-card";

    // Upar: category ka naam aur kharcha
    const top = document.createElement("div");
    top.className = "budget-top";

    const name = document.createElement("span");
    name.className = "budget-name";
    name.textContent = item.category;

    const nums = document.createElement("span");
    nums.className = "budget-nums";
    nums.textContent =
      item.budget > 0
        ? "Rs " + Math.round(item.spent) + " / Rs " + Math.round(item.budget)
        : "Rs " + Math.round(item.spent) + " spent";

    top.appendChild(name);
    top.appendChild(nums);

    // Progress bar
    const bar = document.createElement("div");
    bar.className = "budget-bar";

    const fill = document.createElement("div");
    fill.className = "budget-fill";

    const note = document.createElement("div");
    note.className = "budget-note";

    if (item.budget > 0) {
      const percent = (item.spent / item.budget) * 100;
      fill.style.width = Math.min(100, percent) + "%";

      if (percent > 100) {
        fill.classList.add("over");
        note.textContent =
          "Over budget by Rs " + Math.round(item.spent - item.budget);
        note.classList.add("over-text");
      } else if (percent >= 70) {
        fill.classList.add("warn");
        note.textContent =
          "Careful! Only Rs " + Math.round(item.budget - item.spent) + " left";
      } else {
        fill.classList.add("ok");
        note.textContent =
          "Rs " + Math.round(item.budget - item.spent) + " left";
      }
    } else {
      fill.style.width = "0%";
      note.textContent = "No budget set";
    }

    bar.appendChild(fill);

    // Budget set karne ka box
    const row = document.createElement("div");
    row.className = "budget-row";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.placeholder = "Monthly limit (Rs)";
    input.value = item.budget > 0 ? item.budget : "";

    const btn = document.createElement("button");
    btn.textContent = "Set";
    btn.addEventListener("click", function () {
      saveBudget(item.category, input.value);
    });

    row.appendChild(input);
    row.appendChild(btn);

    card.appendChild(top);
    card.appendChild(bar);
    card.appendChild(note);
    card.appendChild(row);
    budgetList.appendChild(card);
  });
}

// Budget tab kholne par taaza hisaab dikhao
budgetTab.addEventListener("click", loadBudgets);