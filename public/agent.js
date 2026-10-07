// ---------- StudyDesk AI agent chat ----------
const agentForm = document.getElementById("agentForm");
const agentInput = document.getElementById("agentInput");
const agentSend = document.getElementById("agentSend");
const agentMessages = document.getElementById("agentMessages");
const agentHistory = [];

function addAgentMessage(role, text, pending) {
  const row = document.createElement("div");
  row.className = "agent-message " + role;
  if (role === "assistant") {
    const avatar = document.createElement("span");
    avatar.className = "agent-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "✦";
    row.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className = "agent-bubble";
  bubble.textContent = text;
  if (pending) bubble.classList.add("agent-pending");
  row.appendChild(bubble);
  agentMessages.appendChild(row);
  agentMessages.scrollTop = agentMessages.scrollHeight;
  return bubble;
}

async function sendAgentMessage(message) {
  const text = message.trim();
  if (!text || agentSend.disabled) return;

  addAgentMessage("user", text);
  agentHistory.push({ role: "user", content: text });
  agentInput.value = "";
  agentSend.disabled = true;
  agentSend.textContent = "Thinking…";
  const pending = addAgentMessage("assistant", "Reviewing your study data…", true);

  try {
    const now = new Date();
    const localToday = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
    const res = await apiFetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: agentHistory.slice(-10), today: localToday })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "The study agent could not reply.");

    pending.textContent = (data.offline ? "Local study helper (no API credits)\n\n" : "") + data.reply;
    pending.classList.remove("agent-pending");
    if (data.offline) pending.classList.add("agent-offline");
    agentHistory.push({ role: "assistant", content: data.reply });
  } catch (error) {
    pending.textContent = error.message || "Could not reach the study agent. Please try again.";
    pending.classList.remove("agent-pending");
    pending.classList.add("agent-error");
    agentHistory.pop();
  } finally {
    agentSend.disabled = false;
    agentSend.textContent = "Send";
    agentInput.focus();
    agentMessages.scrollTop = agentMessages.scrollHeight;
  }
}

agentForm.addEventListener("submit", function (event) {
  event.preventDefault();
  sendAgentMessage(agentInput.value);
});

agentInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    agentForm.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach(function (button) {
  button.addEventListener("click", function () {
    sendAgentMessage(button.dataset.prompt);
  });
});
