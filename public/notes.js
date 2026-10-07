// ---------- Notes ----------
const noteTitle = document.getElementById("noteTitle");
const noteContent = document.getElementById("noteContent");
const noteSaveBtn = document.getElementById("noteSaveBtn");
const noteCancelBtn = document.getElementById("noteCancelBtn");
const noteSearch = document.getElementById("noteSearch");
const noteFilter = document.getElementById("noteFilter");
const noteList = document.getElementById("noteList");

let allNotes = [];
let editingId = null;

async function loadNotes() {
  try {
    const res = await apiFetch("/api/notes");
    if (res.status === 401) return;
    if (!res.ok) throw new Error("Notes load nahi ho sakin.");
    allNotes = await res.json();
    if (window.studyDeskUser) StudyCache.save(window.studyDeskUser, "notes", allNotes);
    showNotes();
  } catch (error) {
    if (typeof window.setStudyDeskOffline === "function") window.setStudyDeskOffline();
    allNotes = window.studyDeskUser ? (StudyCache.read(window.studyDeskUser, "notes") || []) : [];
    showNotes();
  }
}

function escapeNoteHtml(value) {
  return value.replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
  });
}

function renderNoteMarkdown(value) {
  return escapeNoteHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function noteEditedLabel(note) {
  const timestamp = note.updated_at || note.created_at;
  if (!timestamp) return "";
  const date = new Date(timestamp.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return "Edited " + date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function showNotes() {
  const query = noteSearch.value.trim().toLowerCase();
  const filter = noteFilter.value;
  const filtered = allNotes.filter(function (note) {
    const matchesText = note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query);
    return matchesText && (filter === "all" || Boolean(note.pinned));
  });

  noteList.innerHTML = "";
  noteList.className = "note-list";
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-text";
    empty.textContent = allNotes.length
      ? "Is search mein koi note nahi mila."
      : (window.isStudyDeskOffline ? "Is browser mein koi saved note backup nahi mila." : "Abhi koi note nahi. Upar apna pehla note likhein.");
    noteList.appendChild(empty);
    return;
  }

  filtered.forEach(function (note) {
    const card = document.createElement("article");
    card.className = "note-card";
    if (note.pinned) card.classList.add("note-pinned");

    const top = document.createElement("div");
    top.className = "note-card-top";
    const title = document.createElement("h3");
    title.textContent = note.title;
    const edited = document.createElement("time");
    edited.className = "note-edited";
    edited.textContent = noteEditedLabel(note);
    top.append(title, edited);

    const content = document.createElement("p");
    content.className = "note-content";
    content.innerHTML = renderNoteMarkdown(note.content);

    const actions = document.createElement("div");
    actions.className = "note-actions";
    const flashcardBtn = document.createElement("button");
    flashcardBtn.type = "button";
    flashcardBtn.textContent = "Make flashcard";
    flashcardBtn.className = "note-flashcard";
    flashcardBtn.disabled = window.isStudyDeskOffline || !note.content.trim();
    flashcardBtn.title = note.content.trim() ? "Create a question and answer card from this note" : "Add note content first";
    flashcardBtn.addEventListener("click", async function () {
      if (note.title.length > 200 || note.content.length > 10000) {
        alert("Is note ko card banane ke liye title 200 aur content 10,000 characters se chhota hona chahiye.");
        return;
      }
      flashcardBtn.disabled = true;
      try {
        const response = await apiFetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: note.title, answer: note.content, source_note_id: note.id })
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(data.error || "Note ka flashcard nahi bana.");
        await loadFlashcards();
        showFlashcardStatus("Note se flashcard ban gaya.", false);
        document.querySelector('.tab[data-section="flashcards"]').click();
      } catch (error) {
        alert(error.message || "Flashcard save nahi hua.");
        flashcardBtn.disabled = window.isStudyDeskOffline;
      }
    });
    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.textContent = note.pinned ? "Unpin" : "Pin note";
    pinBtn.className = "note-pin";
    pinBtn.setAttribute("aria-label", (note.pinned ? "Unpin " : "Pin ") + note.title);
    pinBtn.addEventListener("click", async function () {
      pinBtn.disabled = true;
      try {
        const res = await apiFetch("/api/notes/" + note.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: note.title, content: note.content, pinned: note.pinned ? 0 : 1 })
        });
        if (!res.ok) throw new Error("Note pin nahi ho saka. Dobara try karein.");
        await loadNotes();
      } catch (error) {
        alert(error.message || "Note update nahi ho saka.");
        pinBtn.disabled = false;
      }
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.className = "note-edit";
    editBtn.addEventListener("click", function () {
      editingId = note.id;
      noteTitle.value = note.title;
      noteContent.value = note.content;
      noteSaveBtn.textContent = "Update note";
      noteCancelBtn.style.display = "inline-block";
      noteTitle.focus();
      document.querySelector("#notes .note-form").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "note-del";
    deleteBtn.addEventListener("click", async function () {
      if (!window.confirm('"' + note.title + '" note delete karna pakka hai?')) return;
      deleteBtn.disabled = true;
      try {
        const res = await apiFetch("/api/notes/" + note.id, { method: "DELETE" });
        if (!res.ok) throw new Error("Note delete nahi ho saka. Internet check karein.");
        await loadNotes();
      } catch (error) {
        alert(error.message || "Note delete nahi ho saka.");
        deleteBtn.disabled = false;
      }
    });

    actions.append(flashcardBtn, pinBtn, editBtn, deleteBtn);
    if (window.isStudyDeskOffline) {
      [flashcardBtn, pinBtn, editBtn, deleteBtn].forEach(function (button) {
        button.disabled = true;
        button.title = "Reconnect to the server to edit notes";
      });
    }
    card.append(top, content, actions);
    noteList.appendChild(card);
  });
}

function resetNoteForm() {
  editingId = null;
  noteTitle.value = "";
  noteContent.value = "";
  noteSaveBtn.textContent = "Save note";
  noteCancelBtn.style.display = "none";
}

noteSaveBtn.addEventListener("click", async function () {
  const title = noteTitle.value.trim();
  const content = noteContent.value.trim();
  if (!title) {
    alert("Pehle note ka title likhein.");
    noteTitle.focus();
    return;
  }

  const url = editingId ? "/api/notes/" + editingId : "/api/notes";
  const method = editingId ? "PUT" : "POST";
  const originalLabel = editingId ? "Update note" : "Save note";
  noteSaveBtn.disabled = true;
  noteSaveBtn.textContent = "Saving...";
  try {
    const res = await apiFetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, content: content })
    });
    if (!res.ok) {
      const data = await res.json().catch(function () { return {}; });
      throw new Error(data.error || "Note save nahi ho saka. Internet check karein.");
    }
    resetNoteForm();
    await loadNotes();
  } catch (error) {
    alert(error.message || "Note save nahi ho saka.");
    noteSaveBtn.textContent = originalLabel;
  } finally {
    noteSaveBtn.disabled = false;
  }
});

noteCancelBtn.addEventListener("click", resetNoteForm);
noteSearch.addEventListener("input", showNotes);
noteFilter.addEventListener("change", showNotes);
