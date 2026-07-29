function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const rem100 = n % 100;
  return n + (suffixes[(rem100 - 20) % 10] || suffixes[rem100] || suffixes[0]);
}

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

  // Simultaneous round-start: the setter is still choosing their secret,
  // so there's no guess/feedback yet to compute real numbers from. Show
  // the box (so its layout/position is stable from the very start of the
  // round) with placeholder dashes instead of the real stats.
  if (boxState.empty) {
    box.innerHTML = `
      <div class="remaining-stats">
        <div class="remaining-stat">
          <span class="remaining-stat-label">Old</span>
          <span class="remaining-stat-value">–</span>
        </div>
        <div class="remaining-stat">
          <span class="remaining-stat-label">Keep</span>
          <span class="remaining-stat-value">–</span>
        </div>
        <div class="remaining-stat">
          <span class="remaining-stat-label">New</span>
          <span class="remaining-stat-value">–</span>
        </div>
      </div>
    `;
    return;
  }

  const oldStyle = boxState.highlightOld ? "color: var(--tile-green)" : "";
  const newStyle = boxState.highlightNew ? "color: var(--tile-green)" : "";
  const current = boxState.current.toLocaleString();

  const guideOn = document.body.classList.contains("guide-on");
  const hint = guideOn
    ? `<div class="line remaining-hint">How many possible secrets would still fit the clues so far — if you keep this secret vs. switch to your typed word.</div>`
    : "";

  const keepValue = boxState.old != null ? boxState.old.toLocaleString() : "?";
  const newValue =
    boxState.isConsistent === false
      ? `<span class="inconsistent-x">✕</span>`
      : boxState.new != null
        ? boxState.new.toLocaleString()
        : "?";

  box.innerHTML = `
    <div class="remaining-stats">
      <div class="remaining-stat">
        <span class="remaining-stat-label">Old</span>
        <span class="remaining-stat-value">${current}</span>
      </div>
      <div class="remaining-stat">
        <span class="remaining-stat-label">Keep</span>
        <span class="remaining-stat-value" style="${oldStyle}">${keepValue}</span>
      </div>
      <div class="remaining-stat">
        <span class="remaining-stat-label">New</span>
        <span class="remaining-stat-value" style="${newStyle}">${newValue}</span>
      </div>
    </div>
    ${hint}
  `;
}

// Wiretap power (guesser): a box showing how many secrets are still
// possible — the same count the setter sees. While the active "tap" is on
// (bullet/blitz), it adds a live line showing how many would remain if the
// currently-typed guess were submitted.
function renderGuesserRemainingBox(boxState) {
  const box = document.getElementById("GuesserRemainingBox");
  if (!box) return;

  const active = !!window.state?.powers?.wiretapActive;

  // Informant peek (revealLocation): shown here alongside the words-left
  // count so the known letter is a persistent, prominent readout — not a
  // transient popup the guesser has to catch and remember.
  const peek =
    window.state?.activePowers?.includes("revealLocation")
      ? window.state?.powers?.revealLocationPeek
      : null;
  const hasPeek = peek && typeof peek.index === "number" && peek.letter;

  const hasCount = boxState && boxState.visible && boxState.current != null;

  if (!hasCount && !active && !hasPeek) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }

  box.hidden = false;

  const guideOn = document.body.classList.contains("guide-on");
  const hint = guideOn
    ? `<div class="line remaining-hint">How many possible secrets still fit every clue so far — the same number the Spy sees.</div>`
    : "";

  const currentLine =
    boxState && boxState.current != null
      ? `<div class="line">
           <span class="label">🎧 Possible</span>
           <span class="value">${boxState.current.toLocaleString()}</span>
         </div>`
      : "";

  const informantLine = hasPeek
    ? `<div class="line informant-line">
         <span class="label">🔦 ${ordinal(peek.index + 1)} letter</span>
         <span class="value"><span class="informant-tile">${peek.letter}</span></span>
       </div>`
    : "";

  let liveLine = "";
  if (active) {
    const live = window._wiretapLive;
    // The server echoes the draft it scored, so show that draft+count pair
    // directly (no need to match a private local draft variable).
    if (live && live.draft && live.draft.length === 5 && live.invalid) {
      // Complete but not a real dictionary word — could never actually be
      // submitted, so flag it the same way the setter's box flags an
      // invalid/inconsistent secret rather than showing a bogus count.
      liveLine = `<div class="line wiretap-live">
          <span class="label">↳ ${live.draft}</span>
          <span class="value"><span class="inconsistent-x">✕</span></span>
        </div>`;
    } else if (live && live.draft && live.draft.length === 5 && live.count != null) {
      liveLine = `<div class="line wiretap-live">
          <span class="label">↳ ${live.draft}</span>
          <span class="value">${live.count.toLocaleString()} left</span>
        </div>`;
    } else {
      liveLine = `<div class="line wiretap-live wiretap-live-waiting">
          <span class="label">↳ live tap</span>
          <span class="value">type a guess…</span>
        </div>`;
    }
  }

  box.innerHTML = `${informantLine}${currentLine}${liveLine}${hint}`;
}
