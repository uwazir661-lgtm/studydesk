// ---------- Flashcards ----------
const flashcardForm = document.getElementById("flashcardForm");
const flashcardQuestionInput = document.getElementById("flashcardQuestionInput");
const flashcardAnswerInput = document.getElementById("flashcardAnswerInput");
const flashcardSave = document.getElementById("flashcardSave");
const flashcardStatus = document.getElementById("flashcardStatus");
const flashcardDeck = document.getElementById("flashcardDeck");
const flashcardPrompt = document.getElementById("flashcardPrompt");
const flashcardAnswer = document.getElementById("flashcardAnswer");
const flashcardPosition = document.getElementById("flashcardPosition");
const flashcardReveal = document.getElementById("flashcardReveal");
const flashcardNext = document.getElementById("flashcardNext");
let flashcards = [];
let currentFlashcardIndex = 0;

function showFlashcardStatus(message, isError) {
  flashcardStatus.textContent = message;
  flashcardStatus.classList.toggle("is-error", Boolean(isError));
  flashcardStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderFlashcardReview() {
  const hasCards = flashcards.length > 0;
  flashcardReveal.disabled = !hasCards;
  flashcardNext.disabled = flashcards.length < 2;
  if (!hasCards) {
    flashcardPrompt.textContent = "Add a card to start reviewing.";
    flashcardAnswer.textContent = "";
    flashcardAnswer.hidden = true;
    flashcardPosition.textContent = "0 cards";
    flashcardReveal.textContent = "Show answer";
    return;
  }

  currentFlashcardIndex = (currentFlashcardIndex + flashcards.length) % flashcards.length;
  const card = flashcards[currentFlashcardIndex];
  flashcardPrompt.textContent = card.question;
  flashcardAnswer.textContent = card.answer;
  flashcardAnswer.hidden = true;
  flashcardPosition.textContent = (currentFlashcardIndex + 1) + " of " + flashcards.length;
  flashcardReveal.textContent = "Show answer";
}

function renderFlashcardDeck() {
  flashcardDeck.replaceChildren();
  if (!flashcards.length) {
    const empty = document.createElement("p");
    empty.className = "flashcard-empty";
    empty.textContent = "Abhi cards nahi hain. Note se card banao ya upar naya question-answer add karo.";
    flashcardDeck.appendChild(empty);
    renderFlashcardReview();
    return;
  }

  flashcards.forEach(function (card, index) {
    const item = document.createElement("article");
    item.className = "flashcard-item";
    const copy = document.createElement("div");
    copy.className = "flashcard-item-copy";
    const question = document.createElement("strong");
    question.textContent = card.question;
    const answer = document.createElement("p");
    answer.textContent = card.answer;
    copy.append(question, answer);

    const actions = document.createElement("div");
    actions.className = "flashcard-item-actions";
    const study = document.createElement("button");
    study.type = "button";
    study.textContent = "Review";
    study.addEventListener("click", function () {
      currentFlashcardIndex = index;
      renderFlashcardReview();
      document.querySelector(".flashcard-review").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "flashcard-delete";
    remove.textContent = "Delete";
    remove.disabled = Boolean(window.isStudyDeskOffline);
    remove.addEventListener("click", async function () {
      if (!window.confirm("Delete this flashcard?")) return;
      remove.disabled = true;
      try {
        const response = await apiFetch("/api/flashcards/" + card.id, { method: "DELETE" });
        if (!response.ok) throw new Error("Flashcard delete nahi hua. Dobara try karein.");
        flashcards = flashcards.filter(function (item) { return item.id !== card.id; });
        if (currentFlashcardIndex >= flashcards.length) currentFlashcardIndex = 0;
        renderFlashcardDeck();
        showFlashcardStatus("Flashcard delete ho gaya.", false);
      } catch (error) {
        remove.disabled = false;
        showFlashcardStatus(error.message || "Server se rabta nahi ho saka.", true);
      }
    });
    actions.append(study, remove);
    item.append(copy, actions);
    flashcardDeck.appendChild(item);
  });
  renderFlashcardReview();
}

async function loadFlashcards() {
  try {
    const response = await apiFetch("/api/flashcards");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Flashcards API load nahi hui. Server restart karke page refresh karein."
      : "Flashcards load nahi ho sake.");
    flashcards = await response.json();
    currentFlashcardIndex = Math.min(currentFlashcardIndex, Math.max(0, flashcards.length - 1));
    renderFlashcardDeck();
  } catch (error) {
    flashcardDeck.textContent = error.message || "Internet/server connection check karein.";
  }
}

flashcardForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  flashcardSave.disabled = true;
  flashcardSave.textContent = "Saving...";
  showFlashcardStatus("", false);
  try {
    const response = await apiFetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: flashcardQuestionInput.value, answer: flashcardAnswerInput.value })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Flashcard save nahi hua.");
    flashcards.unshift(data);
    currentFlashcardIndex = 0;
    flashcardForm.reset();
    renderFlashcardDeck();
    showFlashcardStatus("Flashcard save ho gaya.", false);
    flashcardQuestionInput.focus();
  } catch (error) {
    showFlashcardStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    flashcardSave.disabled = Boolean(window.isStudyDeskOffline);
    flashcardSave.textContent = "Add flashcard";
  }
});

flashcardReveal.addEventListener("click", function () {
  flashcardAnswer.hidden = !flashcardAnswer.hidden;
  flashcardReveal.textContent = flashcardAnswer.hidden ? "Show answer" : "Hide answer";
});

flashcardNext.addEventListener("click", function () {
  currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcards.length;
  renderFlashcardReview();
});

window.addEventListener("studydesk:offline-change", function () {
  flashcardSave.disabled = Boolean(window.isStudyDeskOffline);
  renderFlashcardDeck();
});
