// ---------- Grade Tracker ----------
const gradeForm = document.getElementById("gradeForm");
const gradeSubject = document.getElementById("gradeSubject");
const gradeAssessment = document.getElementById("gradeAssessment");
const gradeScore = document.getElementById("gradeScore");
const gradeTotal = document.getElementById("gradeTotal");
const gradeTarget = document.getElementById("gradeTarget");
const gradeSave = document.getElementById("gradeSave");
const gradeStatus = document.getElementById("gradeStatus");
const gradeSubjects = document.getElementById("gradeSubjects");
const gradeHistory = document.getElementById("gradeHistory");
let gradeEntries = [];
let gradeTargets = [];

function showGradeStatus(message, isError) {
  gradeStatus.textContent = message;
  gradeStatus.classList.toggle("is-error", Boolean(isError));
  gradeStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderGrades() {
  const subjects = new Map();
  gradeEntries.forEach(function (entry) {
    const key = entry.subject.toLocaleLowerCase();
    if (!subjects.has(key)) subjects.set(key, { subject: entry.subject, score: 0, total: 0, count: 0 });
    const group = subjects.get(key);
    group.score += Number(entry.score);
    group.total += Number(entry.total);
    group.count += 1;
  });

  gradeSubjects.replaceChildren();
  if (subjects.size === 0) {
    const empty = document.createElement("p");
    empty.className = "grade-empty";
    empty.textContent = "Marks add karo to subject-wise progress yahan dekho.";
    gradeSubjects.appendChild(empty);
  }
  Array.from(subjects.values()).sort(function (a, b) { return a.subject.localeCompare(b.subject); }).forEach(function (group) {
    const target = gradeTargets.find(function (item) { return item.subject.toLocaleLowerCase() === group.subject.toLocaleLowerCase(); });
    const targetPercent = target ? Number(target.target_percent) : 0;
    const percent = group.total ? Math.round((group.score / group.total) * 1000) / 10 : 0;
    const card = document.createElement("article");
    card.className = "grade-subject-card";
    const top = document.createElement("div");
    top.className = "grade-subject-top";
    const title = document.createElement("h4");
    title.textContent = group.subject;
    const average = document.createElement("strong");
    average.textContent = percent + "%";
    top.append(title, average);
    const meta = document.createElement("p");
    meta.textContent = group.score + " / " + group.total + " marks · " + group.count + " assessment(s) · Target " + targetPercent + "%";
    const bar = document.createElement("div");
    bar.className = "grade-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", group.subject + " average compared with target");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(percent));
    const fill = document.createElement("span");
    fill.style.width = Math.min(100, percent) + "%";
    const targetMark = document.createElement("i");
    targetMark.style.left = targetPercent + "%";
    bar.append(fill, targetMark);
    const result = document.createElement("small");
    result.className = percent >= targetPercent ? "grade-on-target" : "grade-below-target";
    result.textContent = percent >= targetPercent ? "On target" : (Math.ceil(targetPercent - percent) + "% to target");
    card.append(top, meta, bar, result);
    gradeSubjects.appendChild(card);
  });

  gradeHistory.replaceChildren();
  if (!gradeEntries.length) {
    const empty = document.createElement("p");
    empty.className = "grade-empty";
    empty.textContent = "Assessment history abhi khali hai.";
    gradeHistory.appendChild(empty);
    return;
  }
  gradeEntries.forEach(function (entry) {
    const row = document.createElement("article");
    row.className = "grade-history-item";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.assessment;
    const subject = document.createElement("span");
    subject.textContent = entry.subject;
    copy.append(title, subject);
    const score = document.createElement("b");
    score.textContent = entry.score + " / " + entry.total + " (" + Math.round(entry.score / entry.total * 100) + "%)";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "grade-delete";
    remove.textContent = "Delete";
    remove.disabled = Boolean(window.isStudyDeskOffline);
    remove.addEventListener("click", async function () {
      if (!window.confirm("Delete marks for “" + entry.assessment + "”?")) return;
      remove.disabled = true;
      try {
        const response = await apiFetch("/api/grades/" + entry.id, { method: "DELETE" });
        if (!response.ok) throw new Error("Marks delete nahi hue.");
        gradeEntries = gradeEntries.filter(function (item) { return item.id !== entry.id; });
        renderGrades();
        showGradeStatus("Assessment marks delete ho gaye.", false);
      } catch (error) {
        remove.disabled = false;
        showGradeStatus(error.message || "Server se rabta nahi ho saka.", true);
      }
    });
    row.append(copy, score, remove);
    gradeHistory.appendChild(row);
  });
}

async function loadGrades() {
  try {
    const response = await apiFetch("/api/grades");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Grade Tracker API load nahi hui. Server restart karke page refresh karein."
      : "Grades load nahi ho sake.");
    const data = await response.json();
    gradeEntries = data.entries;
    gradeTargets = data.targets;
    renderGrades();
  } catch (error) {
    gradeSubjects.textContent = error.message || "Internet/server connection check karein.";
  }
}

gradeForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  gradeSave.disabled = true;
  gradeSave.textContent = "Saving...";
  showGradeStatus("", false);
  try {
    const response = await apiFetch("/api/grades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: gradeSubject.value,
        assessment: gradeAssessment.value,
        score: Number(gradeScore.value),
        total: Number(gradeTotal.value),
        target_percent: Number(gradeTarget.value)
      })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Marks save nahi hue. Details check karein.");
    gradeForm.reset();
    gradeTarget.value = "80";
    await loadGrades();
    showGradeStatus("Marks save ho gaye.", false);
    gradeSubject.focus();
  } catch (error) {
    showGradeStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    gradeSave.disabled = Boolean(window.isStudyDeskOffline);
    gradeSave.textContent = "Add marks";
  }
});

window.addEventListener("studydesk:offline-change", function () {
  [gradeSubject, gradeAssessment, gradeScore, gradeTotal, gradeTarget].forEach(function (input) {
    input.disabled = Boolean(window.isStudyDeskOffline);
  });
  gradeSave.disabled = Boolean(window.isStudyDeskOffline);
  renderGrades();
});
