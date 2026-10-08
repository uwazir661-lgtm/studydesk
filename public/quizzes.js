// ---------- Practice Quizzes ----------
const quizCreateForm = document.getElementById("quizCreateForm");
const quizTitleInput = document.getElementById("quizTitleInput");
const quizQuestionBuilder = document.getElementById("quizQuestionBuilder");
const quizAddQuestion = document.getElementById("quizAddQuestion");
const quizSave = document.getElementById("quizSave");
const quizStatus = document.getElementById("quizStatus");
const quizList = document.getElementById("quizList");
const quizHistory = document.getElementById("quizHistory");
const quizRunner = document.getElementById("quizRunner");
const quizRunnerTitle = document.getElementById("quizRunnerTitle");
const quizAttemptForm = document.getElementById("quizAttemptForm");
const quizAttemptQuestions = document.getElementById("quizAttemptQuestions");
const quizSubmitAttempt = document.getElementById("quizSubmitAttempt");
const quizCancelAttempt = document.getElementById("quizCancelAttempt");
let quizDraftQuestions = [];
let availableQuizzes = [];
let activeQuiz = null;

function newQuizDraftQuestion() {
  return { prompt: "", options: ["", "", "", ""], correct_index: 0 };
}

function showQuizStatus(message, isError) {
  quizStatus.textContent = message;
  quizStatus.classList.toggle("is-error", Boolean(isError));
  quizStatus.classList.toggle("is-success", Boolean(message) && !isError);
}

function renderQuizDraftQuestions() {
  quizQuestionBuilder.replaceChildren();
  quizDraftQuestions.forEach(function (question, questionIndex) {
    const card = document.createElement("fieldset");
    card.className = "quiz-draft-question";
    const legend = document.createElement("legend");
    legend.textContent = "Question " + (questionIndex + 1);
    card.appendChild(legend);

    const promptLabel = document.createElement("label");
    promptLabel.textContent = "Question text";
    const prompt = document.createElement("textarea");
    prompt.maxLength = 500;
    prompt.rows = 2;
    prompt.required = true;
    prompt.placeholder = "Write a question...";
    prompt.value = question.prompt;
    prompt.addEventListener("input", function () { question.prompt = prompt.value; });
    promptLabel.appendChild(prompt);
    card.appendChild(promptLabel);

    const choices = document.createElement("div");
    choices.className = "quiz-choice-fields";
    question.options.forEach(function (value, choiceIndex) {
      const label = document.createElement("label");
      label.textContent = "Choice " + (choiceIndex + 1);
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 200;
      input.required = true;
      input.placeholder = "Answer choice";
      input.value = value;
      input.addEventListener("input", function () { question.options[choiceIndex] = input.value; });
      label.appendChild(input);
      choices.appendChild(label);
    });
    card.appendChild(choices);

    const footer = document.createElement("div");
    footer.className = "quiz-draft-footer";
    const correctLabel = document.createElement("label");
    correctLabel.textContent = "Correct answer";
    const correct = document.createElement("select");
    ["Choice 1", "Choice 2", "Choice 3", "Choice 4"].forEach(function (text, index) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = text;
      correct.appendChild(option);
    });
    correct.value = String(question.correct_index);
    correct.addEventListener("change", function () { question.correct_index = Number(correct.value); });
    correctLabel.appendChild(correct);
    footer.appendChild(correctLabel);

    if (quizDraftQuestions.length > 1) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "quiz-remove-question";
      remove.textContent = "Remove question";
      remove.disabled = Boolean(window.isStudyDeskOffline);
      remove.addEventListener("click", function () {
        quizDraftQuestions.splice(questionIndex, 1);
        renderQuizDraftQuestions();
      });
      footer.appendChild(remove);
    }
    card.appendChild(footer);
    if (window.isStudyDeskOffline) card.querySelectorAll("input, textarea, select").forEach(function (input) { input.disabled = true; });
    quizQuestionBuilder.appendChild(card);
  });
  quizAddQuestion.disabled = quizDraftQuestions.length >= 20 || Boolean(window.isStudyDeskOffline);
}

function renderQuizList() {
  quizList.replaceChildren();
  if (!availableQuizzes.length) {
    const empty = document.createElement("p");
    empty.className = "quiz-empty";
    empty.textContent = "Abhi quiz nahi bana. Topic select karke upar pehla quiz banayein.";
    quizList.appendChild(empty);
    return;
  }
  availableQuizzes.forEach(function (quiz) {
    const item = document.createElement("article");
    item.className = "quiz-list-item";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = quiz.title;
    const meta = document.createElement("span");
    meta.textContent = quiz.question_count + " questions · " + quiz.attempt_count + " attempts";
    copy.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "quiz-list-actions";
    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Start quiz";
    start.disabled = Boolean(window.isStudyDeskOffline);
    start.addEventListener("click", function () { startQuiz(quiz.id); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiz-delete";
    remove.textContent = "Delete";
    remove.disabled = Boolean(window.isStudyDeskOffline);
    remove.addEventListener("click", async function () {
      if (!window.confirm("Delete “" + quiz.title + "” and its score history?")) return;
      remove.disabled = true;
      try {
        const response = await apiFetch("/api/quizzes/" + quiz.id, { method: "DELETE" });
        if (!response.ok) throw new Error("Quiz delete nahi hua.");
        await loadQuizzes();
        await loadQuizHistory();
        showQuizStatus("Quiz aur uski history delete ho gayi.", false);
      } catch (error) {
        remove.disabled = false;
        showQuizStatus(error.message || "Server se rabta nahi ho saka.", true);
      }
    });
    actions.append(start, remove);
    item.append(copy, actions);
    quizList.appendChild(item);
  });
}

async function loadQuizzes() {
  try {
    const response = await apiFetch("/api/quizzes");
    if (response.status === 401) return;
    if (!response.ok) throw new Error(response.status === 404
      ? "Practice Quiz API load nahi hui. Server restart karke page refresh karein."
      : "Quizzes load nahi ho sake.");
    availableQuizzes = await response.json();
    renderQuizList();
  } catch (error) {
    quizList.textContent = error.message || "Internet/server connection check karein.";
  }
}

function renderQuizHistory(attempts) {
  quizHistory.replaceChildren();
  if (!attempts.length) {
    const empty = document.createElement("p");
    empty.className = "quiz-empty";
    empty.textContent = "Quiz complete karne ke baad score yahan nazar aayega.";
    quizHistory.appendChild(empty);
    return;
  }
  attempts.forEach(function (attempt) {
    const row = document.createElement("article");
    row.className = "quiz-history-item";
    const title = document.createElement("strong");
    title.textContent = attempt.quiz_title;
    const score = document.createElement("span");
    const percent = Math.round((attempt.score / attempt.total) * 100);
    score.textContent = attempt.score + " / " + attempt.total + " · " + percent + "%";
    const date = document.createElement("time");
    const completedAt = new Date(attempt.completed_at.replace(" ", "T") + "Z");
    date.textContent = Number.isNaN(completedAt.getTime()) ? "" : completedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    row.append(title, score, date);
    quizHistory.appendChild(row);
  });
}

async function loadQuizHistory() {
  try {
    const response = await apiFetch("/api/quiz-attempts");
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Score history load nahi ho saki.");
    renderQuizHistory(await response.json());
  } catch (error) {
    quizHistory.textContent = error.message || "Internet/server connection check karein.";
  }
}

async function startQuiz(id) {
  try {
    const response = await apiFetch("/api/quizzes/" + id);
    const quiz = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(quiz.error || "Quiz open nahi ho saka.");
    activeQuiz = quiz;
    quizRunnerTitle.textContent = quiz.title;
    quizAttemptQuestions.replaceChildren();
    quiz.questions.forEach(function (question, index) {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "quiz-attempt-question";
      const legend = document.createElement("legend");
      legend.textContent = (index + 1) + ". " + question.prompt;
      fieldset.appendChild(legend);
      question.options.forEach(function (choice, choiceIndex) {
        const label = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "quiz-question-" + question.id;
        radio.value = String(choiceIndex);
        radio.required = true;
        const text = document.createElement("span");
        text.textContent = choice;
        label.append(radio, text);
        fieldset.appendChild(label);
      });
      quizAttemptQuestions.appendChild(fieldset);
    });
    quizAttemptForm.reset();
    quizSubmitAttempt.disabled = Boolean(window.isStudyDeskOffline);
    quizRunner.hidden = false;
    quizRunner.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showQuizStatus(error.message || "Quiz load nahi ho saka.", true);
  }
}

quizCreateForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  quizSave.disabled = true;
  quizSave.textContent = "Saving...";
  showQuizStatus("", false);
  try {
    const response = await apiFetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: quizTitleInput.value, questions: quizDraftQuestions })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Quiz save nahi hua. Details check karein.");
    quizCreateForm.reset();
    quizDraftQuestions = [newQuizDraftQuestion()];
    renderQuizDraftQuestions();
    showQuizStatus("Quiz save ho gaya.", false);
    await loadQuizzes();
  } catch (error) {
    showQuizStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    quizSave.disabled = Boolean(window.isStudyDeskOffline);
    quizSave.textContent = "Save quiz";
  }
});

quizAddQuestion.addEventListener("click", function () {
  if (quizDraftQuestions.length >= 20) return;
  quizDraftQuestions.push(newQuizDraftQuestion());
  renderQuizDraftQuestions();
  quizQuestionBuilder.lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
});

quizAttemptForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!activeQuiz) return;
  const answers = activeQuiz.questions.map(function (question) {
    const selected = quizAttemptForm.querySelector('input[name="quiz-question-' + question.id + '"]:checked');
    return selected ? { question_id: question.id, selected_index: Number(selected.value) } : null;
  });
  if (answers.some(function (answer) { return answer === null; })) {
    showQuizStatus("Har sawal ka jawab select karein.", true);
    return;
  }
  quizSubmitAttempt.disabled = true;
  quizSubmitAttempt.textContent = "Checking...";
  try {
    const response = await apiFetch("/api/quizzes/" + activeQuiz.id + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answers })
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || "Score save nahi ho saka.");
    showQuizStatus("Tumhara score: " + data.score + " / " + data.total + " (" + Math.round(data.score / data.total * 100) + "%).", false);
    quizRunner.hidden = true;
    activeQuiz = null;
    await Promise.all([loadQuizzes(), loadQuizHistory()]);
  } catch (error) {
    showQuizStatus(error.message || "Server se rabta nahi ho saka.", true);
  } finally {
    quizSubmitAttempt.disabled = Boolean(window.isStudyDeskOffline);
    quizSubmitAttempt.textContent = "Submit answers";
  }
});

quizCancelAttempt.addEventListener("click", function () {
  activeQuiz = null;
  quizRunner.hidden = true;
});

quizDraftQuestions = [newQuizDraftQuestion()];
renderQuizDraftQuestions();
window.addEventListener("studydesk:offline-change", function () {
  quizSave.disabled = Boolean(window.isStudyDeskOffline);
  quizQuestionBuilder.querySelectorAll("input, textarea, select, button").forEach(function (control) {
    control.disabled = Boolean(window.isStudyDeskOffline);
  });
  quizAddQuestion.disabled = quizDraftQuestions.length >= 20 || Boolean(window.isStudyDeskOffline);
  quizRunner.querySelectorAll("input, button").forEach(function (control) {
    control.disabled = Boolean(window.isStudyDeskOffline);
  });
  renderQuizList();
});
