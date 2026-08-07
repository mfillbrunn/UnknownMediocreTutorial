function renderSetterCoverStrength(
  strength
) {
  const el =
    document.getElementById(
      "setterCoverStrength"
    );

  if (!el) {
    return;
  }

  if (!strength?.visible) {
    el.classList.add("hidden");
    el.removeAttribute(
      "data-status"
    );
    el.removeAttribute("title");
    return;
  }

  el.classList.remove("hidden");

  el.dataset.status =
    strength.status ||
    "available";

  const starCount = Math.max(
    0,
    Math.min(
      3,
      Number(
        strength.stars
      ) || 0
    )
  );

  el
    .querySelectorAll(
      "[data-cover-star]"
    )
    .forEach(
      (star, index) => {
        star.classList.toggle(
          "is-filled",
          index < starCount
        );
      }
    );

  const textEl =
    el.querySelector(
      ".cover-strength-text"
    );

  let shortText = "";
  let description = "";

  switch (strength.status) {
    case "keep-best":
      shortText = "KEEP BEST";

      description =
        "No legal switch leaves more possible secrets than keeping the current word.";

      break;

    case "invalid":
      shortText = "INVALID";

      description =
        "This draft is not a legal secret under the current clues.";

      break;

    case "same":
      shortText = "SAME";

      description =
        "This is the current secret, so it is not rated as a switch.";

      break;

    case "loses":
      shortText = "LOSES";

      description =
        "This draft matches the Inspector's pending guess and would end the round.";

      break;

    case "weaker":
      shortText = "BELOW KEEP";

      description =
        `This draft leaves ${
          strength.draftCount ?? 0
        } possible secrets; ` +
        `keeping leaves ${
          strength.keepCount ?? 0
        }.`;

      break;

    case "rated":
      shortText =
        `${strength.draftCount}/` +
        `${strength.bestCount}`;

      description =
        `${starCount} of 3 stars. ` +
        `This draft leaves ` +
        `${strength.draftCount} ` +
        `possible secrets; the best ` +
        `legal switch leaves ` +
        `${strength.bestCount}. ` +
        `It is ` +
        `${strength.draftGapPct}% ` +
        `below the best available ` +
        `switch.`;

      break;

    default:
      shortText =
        strength.hasUpgrade
          ? (
              `BEST +` +
              `${strength.bestImprovementPct}%`
            )
          : "KEEP BEST";

      description =
        strength.hasUpgrade
          ? (
              `A best available switch ` +
              `leaves ` +
              `${strength.bestCount} ` +
              `possible secrets, ` +
              `${strength.bestImprovementPct}% ` +
              `more than keeping. ` +
              `${strength.betterCount} ` +
              `stronger switch` +
              (
                strength.betterCount === 1
                  ? ""
                  : "es"
              ) +
              ` are available.`
            )
          : (
              "No stronger legal " +
              "switch is available."
            );

      break;
  }

  if (textEl) {
    textEl.textContent =
      shortText;
  }

  el.title = description;

  el.setAttribute(
    "aria-label",
    description
  );
}
function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const rem100 = n % 100;
  return n + (suffixes[(rem100 - 20) % 10] || suffixes[rem100] || suffixes[0]);
}

function renderSetterRemainingBox(
  boxState
) {
  renderSetterCoverStrength(
    boxState?.coverStrength
  );

  const box =
    document.getElementById(
      "SetterRemainingBox"
    );
  if (!box) return;

  // This box's live updates arrive over their own socket event (see
  // socket-events.js), never through window.state -- the advanced
  // tutorial's invalid-draft demo hooks in here for the same reason
  // window.refreshTutorialKeyDemo hooks into the draft renderers.
  window.refreshTutorialRemainingBox?.(boxState);

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

  const hasCount = boxState && boxState.visible && boxState.current != null;

  if (!hasCount && !active) {
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

  box.innerHTML = `${currentLine}${liveLine}${hint}`;
}
