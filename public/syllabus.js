// ---------- Syllabus Tracker ----------
const syllabusForm = document.getElementById("syllabusForm");
const syllabusSubject = document.getElementById("syllabusSubject");
const syllabusChapter = document.getElementById("syllabusChapter");
const syllabusSave = document.getElementById("syllabusSave");
const syllabusStatus = document.getElementById("syllabusStatus");
const syllabusList = document.getElementById("syllabusList");
let syllabusChapters = [];

function setSyllabusStatus(message, isError) {
  syllabusStatus.textContent = message;
  syllabusStatus.classList.toggle("is-error", Boolean(isError));
  syllabusStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderSyllabus() {
  syllabusList.replaceChildren();
  if (syllabusChapters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "syllabus-empty";
    empty.textContent = "Abhi syllabus add nahi hua. Pehla subject aur chapter upar add karein.";
    syllabusList.appendChild(empty);
    return;
  }

  const groups = new Map();
  syllabusChapters.forEach(function (item) {
    if (!groups.has(item.subject)) groups.set(item.subject, []);
    groups.get(item.subject).push(item);
  });

  groups.forEach(function (chapters, subject) {
    const completed = chapters.filter(function (item) { return Boolean(item.is_complete); }).length;
    const percentage = Math.round((completed / chapters.length) * 100);
    const card = document.createElement("section");
    card.className = "syllabus-subject-card";

    const heading = document.createElement("div");
    heading.className = "syllabus-subject-heading";
    const title = document.createElement("h3");
    title.textContent = subject;
    const progressLabel = document.createElement("span");
    progressLabel.textContent = completed + " / " + chapters.length + " complete · " + percentage + "%";
    heading.append(title, progressLabel);

    const progress = document.createElement("div");
    progress.className = "syllabus-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", subject + " completion");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(percentage));
    const fill = document.createElement("span");
    fill.style.width = percentage + "%";
    progress.appendChild(fill);
    card.append(heading, progress);

    const list = document.createElement("ul");
    list.className = "syllabus-chapter-list";
    chapters.forEach(function (chapter) {
      const row = document.createElement("li");
      if (chapter.is_complete) row.classList.add("is-complete");
      const label = document.createElement("label");
      label.className = "syllabus-chapter-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(chapter.is_complete);
      checkbox.setAttribute("aria-label", "Mark " + chapter.chapter + " " + (chapter.is_complete ? "incomplete" : "complete"));
      checkbox.disabled = Boolean(window.isStudyDeskOffline);
      checkbox.addEventListener("change", async function () {
        checkbox.disabled = true;
        try {
          const response = await apiFetch("/api/syllabus/" + chapter.id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_complete: checkbox.checked })
          });
          if (!response.ok) throw new Error("Chapter update nahi hua. Dobara try karein.");
          chapter.is_complete = checkbox.checked ? 1 : 0;
          renderSyllabus();
        } catch (error) {
          checkbox.checked = !checkbox.checked;
          checkbox.disabled = false;
          setSyllabusStatus(error.message || "Server se rabta nahi ho saka.", true);
        }
      });
      const text = document.createElement("span");
      text.textContent = chapter.chapter;
      label.append(checkbox, text);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "syllabus-delete";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", "Delete " + chapter.chapter);
      remove.disabled = Boolean(window.isStudyDeskOffline);
      remove.addEventListener("click", async function () {
        if (!window.confirm("Delete chapter “" + chapter.chapter + "”?")) return;
        remove.disabled = true;
        try {
          const response = await apiFetch("/api/syllabus/" + chapter.id, { method: "DELETE" });
          if (!response.ok) throw new Error("Chapter delete nahi hua. Dobara try karein.");
          syllabusChapters = syllabusChapters.filter(function (item) { return item.id !== chapter.id; });
          renderSyllabus();
          setSyllabusStatus("Chapter delete ho gaya.", false);
        } catch (error) {
          remove.disabled = false;
          setSyllabusStatus(error.message || "Server se rabta nahi ho saka.", true);
        }
      });
      row.append(label, remove);
      list.appendChild(row);
    });
    card.appendChild(list);
    syllabusList.appendChild(card);
  });
}

async function loadSyllabusTracker() {
  try {
    const response = await apiFetch("/api/syllabus");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Syllabus Tracker API load nahi hui. Server restart karke page refresh karein."
      : "Syllabus load nahi ho saka.");
    syllabusChapters = await response.json();
    renderSyllabus();
  } catch (error) {
    syllabusList.textContent = error.message || "Internet/server connection check karein.";
  }
}

syllabusForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  syllabusSave.disabled = true;
  syllabusSave.textContent = "Saving...";
  setSyllabusStatus("", false);
  try {
    const response = await apiFetch("/api/syllabus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: syllabusSubject.value, chapter: syllabusChapter.value })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Chapter save nahi hua. Dobara try karein.");
    syllabusChapters.push(data);
    syllabusChapters.sort(function (a, b) {
      return a.subject.localeCompare(b.subject) || a.id - b.id;
    });
    syllabusChapter.value = "";
    renderSyllabus();
    setSyllabusStatus("Chapter save ho gaya.", false);
    syllabusChapter.focus();
  } catch (error) {
    setSyllabusStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    syllabusSave.disabled = Boolean(window.isStudyDeskOffline);
    syllabusSave.textContent = "Add chapter";
  }
});

window.addEventListener("studydesk:offline-change", function () {
  syllabusSave.disabled = Boolean(window.isStudyDeskOffline);
  renderSyllabus();
});
