// Power keyboard capture (guesser).
//
// Recon Sweep and Double Tap used to pop a modal with a phone-keyboard text
// input, which dimmed the on-screen keyboard and hid its clue colours. Instead
// these powers now "arm" the on-screen keyboard: keystrokes are captured here
// (via handleGuesserInput's powerKb interception) and mirrored into the normal
// guesser draft row, so the coloured keyboard stays fully visible while typing.
(function () {
  // mode: "letterProbe" | "doubleGuess" | null
  const st = { active: false, mode: null, slot: 0, first: "", buffer: "" };

  const $prompt = () => document.getElementById("powerKbPrompt");

  function showPrompt(text) {
    const el = $prompt();
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }
  function hidePrompt() {
    const el = $prompt();
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function mirror() {
    // Show the in-progress buffer in the normal draft row.
    window.setGuesserDraft?.(st.buffer);
  }

  function reset() {
    st.active = false;
    st.mode = null;
    st.slot = 0;
    st.first = "";
    st.buffer = "";
    hidePrompt();
    window.setGuesserDraft?.("");
    window.updateUI?.();
  }

  function promptFor() {
    if (st.mode === "letterProbe") {
      return "🔎 Recon Sweep — type any 5 letters, then Enter · (backspace to edit)";
    }
    if (st.mode === "doubleGuess") {
      const n = st.slot + 1;
      const firstNote = st.slot === 1 ? `  ·  1st: ${st.first}` : "";
      return `🔫 Double Tap — type guess ${n} of 2, then Enter${firstNote}`;
    }
    return "";
  }

  function canArm() {
    const s = window.state;
    return (
      s &&
      s.phase === "normal" &&
      s.turn === s.guesser &&
      window.myUserId?.() === s.guesser &&
      !s.pendingGuess &&
      !s.powerUsedThisTurn
    );
  }

  window.armPowerKeyboard = function (mode) {
    if (!canArm()) {
      window.toast?.("Wait for your turn");
      return false;
    }
    // Toggle off if the same power is re-armed.
    if (st.active && st.mode === mode) {
      reset();
      return false;
    }
    st.active = true;
    st.mode = mode;
    st.slot = 0;
    st.first = "";
    st.buffer = "";
    showPrompt(promptFor());
    mirror();
    return true;
  };

  window.cancelPowerKeyboard = function () {
    if (st.active) reset();
  };

  window.powerKbActive = function () {
    return st.active;
  };

  window.powerKbMode = function () {
    return st.active ? st.mode : null;
  };

  function submitLetterProbe() {
    if (st.buffer.length !== 5) {
      window.toast?.("Type 5 letters");
      window.shakeDraftRow?.("guesser");
      return;
    }
    window.sendGameAction?.({
      type: "USE_LETTER_PROBE",
      letters: st.buffer,
      role: "guesser"
    });
    reset();
  }

  function submitDoubleGuessWord() {
    const w = st.buffer.toUpperCase();
    if (w.length !== 5) {
      window.toast?.("5 letters!");
      window.shakeDraftRow?.("guesser");
      return;
    }
    if (!window.ALLOWED_GUESSES?.has(w)) {
      window.toast?.("Not in dictionary");
      window.shakeDraftRow?.("guesser");
      return;
    }
    if (st.slot === 0) {
      st.first = w;
      st.slot = 1;
      st.buffer = "";
      showPrompt(promptFor());
      mirror();
      return;
    }
    // Second word complete — fire.
    window.sendGameAction?.({
      type: "USE_DOUBLE_GUESS",
      guess1: st.first,
      guess2: w,
      role: "guesser"
    });
    reset();
  }

  // Called from handleGuesserInput. Returns true if the event was consumed.
  window.powerKbInput = function (event) {
    if (!st.active) return false;

    if (event.type === "BACKSPACE") {
      st.buffer = st.buffer.slice(0, -1);
      mirror();
      return true;
    }
    if (event.type === "LETTER") {
      if (st.buffer.length < 5) {
        st.buffer += String(event.value || "").toUpperCase();
        mirror();
      }
      return true;
    }
    if (event.type === "ENTER") {
      if (st.mode === "letterProbe") submitLetterProbe();
      else if (st.mode === "doubleGuess") submitDoubleGuessWord();
      return true;
    }
    return true;
  };

  // Called on every state update. If it stops being the guesser's turn to
  // arm a power (round moved on, timeout, etc.), quietly stand down so a
  // stale buffer can't linger in the draft row.
  window.powerKbSyncTurn = function () {
    if (st.active && !canArm()) reset();
  };
})();
