// ---------- Exam Countdown ----------
const examForm = document.getElementById("examForm");
const examTitle = document.getElementById("examTitle");
const examSubject = document.getElementById("examSubject");
const examDate = document.getElementById("examDate");
const examSave = document.getElementById("examSave");
const examStatus = document.getElementById("examStatus");
const examList = document.getElementById("examList");
let exams = [];

function daysUntilExam(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const examDay = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((examDay - today) / 86400000);
}

function renderExams() {
  examList.replaceChildren();
  if (exams.length === 0) {
    const empty = document.createElement("p");
    empty.className = "exam-empty";
    empty.textContent = "Abhi koi exam add nahi. Apna pehla exam date add karein.";
    examList.appendChild(empty);
    return;
  }

  exams.forEach(function (exam) {
    const card = document.createElement("article");
    card.className = "exam-card";
    const copy = document.createElement("div");
    copy.className = "exam-card-copy";
    const title = document.createElement("h3");
    title.textContent = exam.title;
    const subject = document.createElement("p");
    subject.textContent = exam.subject || "Exam";
    copy.append(title, subject);

    const countdown = document.createElement("div");
    countdown.className = "exam-countdown";
    const days = daysUntilExam(exam.exam_date);
    const number = document.createElement("strong");
    number.textContent = days > 0 ? String(days) : (days === 0 ? "Today" : "Passed");
    const label = document.createElement("span");
    label.textContent = days > 1 ? "days left" : (days === 1 ? "day left" : "");
    countdown.append(number, label);

    const date = document.createElement("time");
    date.className = "exam-date-label";
    date.dateTime = exam.exam_date;
    date.textContent = new Date(exam.exam_date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });

    const remove = document.createElement("button");
    remove.className = "exam-delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", "Delete " + exam.title);
    remove.disabled = Boolean(window.isStudyDeskOffline);
    remove.addEventListener("click", async function () {
      if (!window.confirm("Delete the exam “" + exam.title + "”?")) return;
      remove.disabled = true;
      try {
        const response = await apiFetch("/api/exams/" + exam.id, { method: "DELETE" });
        if (!response.ok) throw new Error("Exam delete nahi hua. Dobara try karein.");
        exams = exams.filter(function (item) { return item.id !== exam.id; });
        renderExams();
        showExamStatus("Exam delete ho gaya.", false);
      } catch (error) {
        showExamStatus(error.message || "Server se rabta nahi ho saka.", true);
        remove.disabled = false;
      }
    });

    if (days < 0) countdown.classList.add("is-past");
    if (days === 0) countdown.classList.add("is-today");
    card.append(copy, countdown, date, remove);
    examList.appendChild(card);
  });
}

function showExamStatus(message, isError) {
  examStatus.textContent = message;
  examStatus.classList.toggle("is-error", Boolean(isError));
  examStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

async function loadExams() {
  try {
    const response = await apiFetch("/api/exams");
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Exam list load nahi ho saki. Server restart karke refresh karein.");
    exams = await response.json();
    renderExams();
  } catch (error) {
    examList.textContent = error.message || "Internet/server connection check karein.";
  }
}

examForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  examSave.disabled = true;
  examSave.textContent = "Saving...";
  showExamStatus("", false);
  try {
    const response = await apiFetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: examTitle.value,
        subject: examSubject.value,
        exam_date: examDate.value
      })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(response.status === 404
        ? "Naya Exam Countdown API load nahi hua. Server terminal mein Ctrl+C dabayein, phir npm.cmd start chala kar page refresh karein."
        : (data.error || "Exam save nahi hua. Details check karke dobara try karein."));
    }
    examForm.reset();
    exams.push(data);
    exams.sort(function (a, b) { return a.exam_date.localeCompare(b.exam_date); });
    renderExams();
    showExamStatus("Exam save ho gaya.", false);
  } catch (error) {
    showExamStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    examSave.disabled = Boolean(window.isStudyDeskOffline);
    examSave.textContent = "Add exam";
  }
});

window.addEventListener("studydesk:offline-change", function () {
  examSave.disabled = Boolean(window.isStudyDeskOffline);
  renderExams();
});
