
// -----------------------------------------------------
// LOAD WORD LIST FOR CLIENT-SIDE VALIDATION
// -----------------------------------------------------
window.ALLOWED_GUESSES = new Set();
fetch("/api/allowed-guesses")
  .then(r => r.json())
  .then(words => words.forEach(w => window.ALLOWED_GUESSES.add(w.toUpperCase())));
// Load allowed secrets (solutions list)
// Load ALLOWED_SECRETS from the server
window.ALLOWED_SECRETS = new Set();
fetch("/api/allowed-secrets")
  .then(r => r.json())
  .then(words => words.forEach(w => window.ALLOWED_SECRETS.add(w.toUpperCase())));
const show = id => {
  const el = $(id);
  if (!el) {console.warn(`show(): element #${id} not found`); return;}
  el.classList.add("active");
};
const hide = id => {
  const el = $(id);
  if (!el) {return;}
  el.classList.remove("active");
};
window.showScreen = (id) => {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

// updateScreens()/onRejoinUI() only ever hide()/show() a fixed, small set
// of game-related screens (lobby/menu/setterScreen/guesserScreen) — any
// other menu screen the player happened to be on (My Games, Daily
// Challenge, Friends, Account, ...) never got explicitly hidden, so it
// stayed .active underneath the game. Sweep everything first.
window.hideAllScreens = () => {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
};
window.showStartup = function () {
  showScreen("startupScreen");
  document.body.classList.add("menu-mode");
};

function showSubmitBanner(role, text) {
  const banner = document.getElementById("submit-banner");
  if (!banner) return;

  banner.classList.remove("spy", "inspector", "show");
  void banner.offsetWidth; // restart animation

  banner.textContent = text;
  banner.classList.add(role === "spy" ? "spy" : "inspector");

  banner.classList.add("show");
}
function showSystemBanner(text) {
  const banner = document.getElementById("submit-banner");
  if (!banner) return;

  banner.classList.remove("spy", "inspector", "show");
  banner.classList.add("system");

  void banner.offsetWidth; // restart animation

  banner.textContent = text;
  banner.classList.add("show");

  // Cleanup after animation
  clearTimeout(showSystemBanner._t);
  showSystemBanner._t = setTimeout(() => {
    banner.classList.remove("show", "system");
  }, 1600);
}
