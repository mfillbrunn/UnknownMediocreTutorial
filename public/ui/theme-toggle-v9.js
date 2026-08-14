(() => {
  "use strict";

  const STORAGE_KEY = "vowelPlayThemeMode";
  const root = document.documentElement;

  function readMode() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage is optional.
    }
  }

  function updateButton(mode) {
    const button = document.getElementById("themeModeToggleV9");
    if (!button) return;

    const light = mode === "light";
    button.classList.toggle("is-light", light);
    button.setAttribute("aria-pressed", String(light));
    button.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    button.title = light ? "Switch to dark mode" : "Switch to light mode";
    button.innerHTML = `
      <span class="theme-toggle-track-v9" aria-hidden="true">
        <span class="theme-toggle-sun-v9">☀</span>
        <span class="theme-toggle-moon-v9">☾</span>
        <span class="theme-toggle-thumb-v9"></span>
      </span>
      <span class="theme-toggle-label-v9">${light ? "Light" : "Dark"}</span>
    `;
  }

  function applyMode(mode, persist = true) {
    const normalized = mode === "light" ? "light" : "dark";
    root.dataset.themeMode = normalized;
    root.style.colorScheme = normalized;
    if (persist) saveMode(normalized);
    updateButton(normalized);
  }

  function ensureButton() {
    const menu = document.querySelector("#startupScreen .menu-buttons");
    if (!menu) return null;

    let button = document.getElementById("themeModeToggleV9");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "themeModeToggleV9";
      button.className = "menu-btn theme-mode-toggle-v9";
      menu.appendChild(button);
      button.addEventListener("click", () => {
        applyMode(root.dataset.themeMode === "light" ? "dark" : "light");
      });
    }

    return button;
  }

  function init() {
    ensureButton();
    applyMode(readMode(), false);
  }

  window.setVowelPlayThemeMode = applyMode;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
