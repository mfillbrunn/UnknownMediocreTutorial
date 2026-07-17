function renderSetterRemainingBox(boxState) {
  const box = document.getElementById("SetterRemainingBox");
  if (!box) return;

  if (!boxState || !boxState.visible) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }

  box.hidden = false;

  // Toggling the guide re-renders this box purely to add/remove the hint
  // line — it has to reuse the last real numbers, not whatever the most
  // recent full state broadcast happened to carry (that can be stale
  // relative to a live-typed draft, which arrives via a separate event
  // that never touches window.state).
  window._lastRemainingBoxState = boxState;

  const oldStyle = boxState.highlightOld ? "color: var(--tile-green)" : "";
  const newStyle = boxState.highlightNew ? "color: var(--tile-green)" : "";
  const current = boxState.current.toLocaleString();

  const guideOn = document.body.classList.contains("guide-on");
  const hint = guideOn
    ? `<div class="line remaining-hint">How many possible secrets would still fit the clues so far — if you keep this secret vs. switch to your typed word.</div>`
    : "";

  box.innerHTML = `
    <div class="line">
      <span class="label">Keep</span>
      <span class="value" style="${oldStyle}">
        ${current} → ${boxState.old != null ? boxState.old.toLocaleString() : "?"}
      </span>
    </div>
    <div class="line">
      <span class="label">New</span>
      <span class="value" style="${newStyle}">
        ${current} →
        ${
          boxState.isConsistent === false
            ? `<span class="inconsistent-x">✕</span>`
            : boxState.new != null
              ? boxState.new.toLocaleString()
              : "?"
        }
      </span>
    </div>
    ${hint}
  `;
}

// Wiretap power (guesser): a single-line box showing how many secrets are
// still possible — the same count the setter sees.
function renderGuesserRemainingBox(boxState) {
  const box = document.getElementById("GuesserRemainingBox");
  if (!box) return;

  if (!boxState || !boxState.visible || boxState.current == null) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }

  box.hidden = false;

  const guideOn = document.body.classList.contains("guide-on");
  const hint = guideOn
    ? `<div class="line remaining-hint">How many possible secrets still fit every clue so far — the same number the Spy sees.</div>`
    : "";

  box.innerHTML = `
    <div class="line">
      <span class="label">🎧 Possible</span>
      <span class="value">${boxState.current.toLocaleString()}</span>
    </div>
    ${hint}
  `;
}
