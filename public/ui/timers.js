function renderChessClocks() {
  if (!state || !state.timeRemaining) return;
    if (!state.timeControl?.enabled) {
      $("timerSetter")?.classList.add("hidden");
      $("timerGuesser")?.classList.add("hidden");
      return;
    } else {
      $("timerSetter")?.classList.remove("hidden");
      $("timerGuesser")?.classList.remove("hidden");
    }
  const setter = state.setter;
  const guesser = state.guesser;

  applyTimer("timerSetter", setter);
  applyTimer("timerGuesser", guesser);
}

function applyTimer(elementId, role) {
  const el = $(elementId);
  if (!el) return;

  const seconds = state.timeRemaining[role];
  el.textContent = formatTime(seconds);

  // Active highlight
  el.classList.toggle("active", state.activeTimer === role);

  // Warnings
  el.classList.remove("warn-30", "warn-10");
  if (seconds <= 10) el.classList.add("warn-10");
  else if (seconds <= 30) el.classList.add("warn-30");

  // Increment detection
  if (state.timeControl?.mode === "chess" &&prev !== null && seconds > prev) {
    triggerIncrementEffect(el, seconds - prev);
}


  lastTimeRemaining[role] = seconds;
}

function triggerIncrementEffect(el, delta) {
  // Flash the timer
  el.classList.add("increment");
  setTimeout(() => el.classList.remove("increment"), 400);

  // Floating +Xs
  const badge = document.createElement("div");
  badge.className = "timer-increment-badge";
  badge.textContent = `+${delta}s`;

  el.parentElement.style.position = "relative";
  el.parentElement.appendChild(badge);

  setTimeout(() => badge.remove(), 800);
}


function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

setInterval(() => {
  if (window.state?.powers?.forceTimerActive) {
    updateUI(); // <-- this already triggers power uiEffects
  }
}, 250);
