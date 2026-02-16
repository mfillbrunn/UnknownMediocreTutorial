let tutorialCollapsed = false;

function showTutorial(text) {
  const bubble = document.getElementById("tutorialBubble");
  const textEl = document.getElementById("tutorialText");

  if (!bubble || !textEl) return;

  tutorialCollapsed = false;
  bubble.classList.remove("collapsed");
  bubble.classList.remove("hidden");

  textEl.textContent = text;
}


function toggleTutorial() {
  const bubble = document.getElementById("tutorialBubble");
  if (!bubble) return;

  tutorialCollapsed = !tutorialCollapsed;

  bubble.classList.toggle("collapsed", tutorialCollapsed);
}

document.getElementById("tutorialToggleBtn")
  ?.addEventListener("click", e => {
    e.stopPropagation();
    toggleTutorial();
  });
document.getElementById("tutorialBubble")
  ?.addEventListener("click", () => {
    if (tutorialCollapsed) {
      toggleTutorial();
    }
  });

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

function hideTutorial() {
  const bubble = document.getElementById("tutorialBubble");
  if (!bubble) return;

  tutorialCollapsed = false;

  bubble.classList.add("hidden");
  bubble.classList.remove("collapsed");

  clearHighlights();
}
