function showTutorial(text) {
  const bubble = document.getElementById("tutorialBubble");
  const textEl = document.getElementById("tutorialText");

  if (!bubble || !textEl) return;

  textEl.textContent = text;
  bubble.classList.remove("hidden");
}

function hideTutorial() {
  const bubble = document.getElementById("tutorialBubble");
  if (!bubble) return;
  bubble.classList.add("hidden");

  clearHighlights();
}

document.getElementById("tutorialCloseBtn")?.addEventListener("click", hideTutorial);

function highlightKeyboard() {
  const keyboard = document.querySelector(".keyboard");
  if (!keyboard) return;

  keyboard.classList.add("tutorial-highlight");
}

function highlightPower(powerId) {
  const btn = document.querySelector(`[data-power-id="${powerId}"]`);
  if (!btn) return;

  btn.classList.add("tutorial-highlight");
}

function clearHighlights() {
  document.querySelectorAll(".tutorial-highlight")
    .forEach(el => el.classList.remove("tutorial-highlight"));
}

