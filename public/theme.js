const themeToggle = document.getElementById("themeToggle");
const savedThemeKey = "studydesk-theme";

function applyTheme(theme) {
  const useLightTheme = theme === "light";
  document.documentElement.dataset.theme = useLightTheme ? "light" : "dark";
  themeToggle.setAttribute("aria-pressed", String(useLightTheme));
  themeToggle.setAttribute("aria-label", useLightTheme ? "Switch to dark theme" : "Switch to light theme");
  themeToggle.innerHTML = useLightTheme
    ? '<span aria-hidden="true">☾</span> Dark theme'
    : '<span aria-hidden="true">☀</span> Light theme';
}

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem(savedThemeKey) === "light" ? "light" : "dark";
} catch (error) {
  // Use dark mode if browser storage is unavailable.
}
applyTheme(savedTheme);

themeToggle.addEventListener("click", function () {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  try {
    localStorage.setItem(savedThemeKey, nextTheme);
  } catch (error) {
    // The theme still changes for this page view if storage is blocked.
  }
});
