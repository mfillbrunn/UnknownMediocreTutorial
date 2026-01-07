let lastTimeRemaining = { A: null, B: null };
function renderChessClocks() {
  if (!state || !state.timeRemaining) return;

  if (state.phase === "lobby" || !state.timeControl?.enabled) {
    $("timerSetter")?.classList.add("hidden");
    $("timerGuesser")?.classList.add("hidden");
    $("timerSetterOpponent")?.classList.add("hidden");
    $("timerGuesserOpponent")?.classList.add("hidden");
    return;
  } 
  const setter = state.setter;
  const guesser = state.guesser;

  // Always render both role times into all relevant elements
  applyTimer("timerSetter", setter);
  applyTimer("timerSetterOpponent", setter);

  applyTimer("timerGuesser", guesser);
  applyTimer("timerGuesserOpponent", guesser);
  
  $("timerSetter")?.classList.remove("hidden");
  $("timerGuesser")?.classList.remove("hidden");
  $("timerSetterOpponent")?.classList.remove("hidden");
  $("timerGuesserOpponent")?.classList.remove("hidden");
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

  // Increment detection (CHESS MODE ONLY)
  const prev = lastTimeRemaining[role];
  if (
    state.timeControl?.mode === "chess" &&
    typeof prev === "number" &&
    seconds > prev
  ) {
    triggerIncrementEffect(el, seconds - prev);
  }

  // Store current as previous for next tick
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
