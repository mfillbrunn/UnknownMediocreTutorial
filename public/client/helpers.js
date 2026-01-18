
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
  if (!el) {console.warn(`hide(): element #${id} not found`); return;}
  el.classList.remove("active");
};
window.showScreen = (id) => {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};
window.showStartup = function () {
  showScreen("startupScreen");
  document.body.classList.add("menu-mode");
};
