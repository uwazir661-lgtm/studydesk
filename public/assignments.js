// ---------- Assignments ----------
const asgSubject = document.getElementById("asgSubject");
const asgTitle = document.getElementById("asgTitle");
const asgDue = document.getElementById("asgDue");
const asgAddBtn = document.getElementById("asgAddBtn");
const asgList = document.getElementById("asgList");

const STATUSES = ["Not started", "In progress", "Submitted"];

// Aaj se kitne din baqi hain (minus ka matlab late)
function daysLeft(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

// Due date ka text aur rang tay karo
function dueInfo(a) {
  if (a.due_date === "") {
    return { text: "No due date", cls: "" };
  }

  if (a.status === "Submitted") {
    return { text: "Submitted ✅ (due " + a.due_date + ")", cls: "due-done" };
  }

  const d = daysLeft(a.due_date);

  if (d < 0) {
    return { text: "Late by " + Math.abs(d) + " day(s)", cls: "due-late" };
  }
  if (d === 0) {
    return { text: "Due today!", cls: "due-soon" };
  }
  if (d <= 3) {
    return { text: d + " day(s) left", cls: "due-soon" };
  }
  return { text: d + " days left (" + a.due_date + ")", cls: "" };
}

// Status ya marks badlo
async function updateAssignment(id, status, marks) {
  const res = await fetch("/api/assignments/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status, marks: marks })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not update the assignment");
    return;
  }

  loadAssignments();
}

async function loadAssignments() {
  const res = await fetch("/api/assignments");
  if (!res.ok) {
    return;
  }
  const items = await res.json();

  asgList.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = "No assignments yet. Add your first one above!";
    asgList.appendChild(empty);
    return;
  }

  items.forEach(function (a) {
    const card = document.createElement("div");
    card.className = "asg-card";

    // Upar wali patti: subject aur delete
    const top = document.createElement("div");
    top.className = "asg-top";

    const badge = document.createElement("span");
    badge.className = "asg-subject";
    badge.textContent = a.subject;

    const delBtn = document.createElement("button");
    delBtn.className = "asg-del";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async function () {
      await fetch("/api/assignments/" + a.id, { method: "DELETE" });
      loadAssignments();
    });

    top.appendChild(badge);
    top.appendChild(delBtn);

    // Title
    const title = document.createElement("div");
    title.className = "asg-title";
    title.textContent = a.title;

    // Due date
    const info = dueInfo(a);
    const due = document.createElement("div");
    due.className = "asg-due " + info.cls;
    due.textContent = info.text;

    // Neeche wali patti: status dropdown aur marks
    const controls = document.createElement("div");
    controls.className = "asg-controls";

    const select = document.createElement("select");
    STATUSES.forEach(function (s) {
      const opt = document.createElement("option");
      opt.textContent = s;
      if (s === a.status) {
        opt.selected = true;
      }
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

    controls.appendChild(select);
    controls.appendChild(marksInput);

    card.appendChild(top);
    card.appendChild(title);
    card.appendChild(due);
    card.appendChild(controls);
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

  const res = await fetch("/api/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: subject,
      title: title,
      due_date: asgDue.value
    })
  });

  if (!res.ok) {
    const data = await res.json();
    alert(data.error || "Could not add the assignment");
    return;
  }

  asgSubject.value = "";
  asgTitle.value = "";
  asgDue.value = "";
  loadAssignments();
});S