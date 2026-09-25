///History builder
function computeTileClassKey({isSetter, entryRoundIndex, guessIndex, bsIdx, bsRound, safeEntry, fbArray}) {
  const classes = ["history-tile"];
  const isBlindSpot =
    !isSetter &&
    typeof bsIdx === "number" &&
    typeof bsRound === "number" &&
    guessIndex === bsIdx &&
    entryRoundIndex >= bsRound;
  if (isBlindSpot) {
    classes.push("tile-purple");
    return classes.join(" ");
  }
  // Delayed Intel: this round hasn't "unlocked" for the guesser yet (see
  // server/utils/delayedFeedback.js) — fbArray is just a "?" placeholder
  // at this point, which the fallback branch further down would otherwise
  // read as "tile-gray" (falsely implying every letter came back
  // confirmed absent). Render an honest hollow/not-yet-revealed tile
  // instead, before that fallback ever runs.
  if (!isSetter && safeEntry.delayedFeedback) {
    classes.push("tile-delayed");
    return classes.join(" ");
  }
  // Hide Evidence / Vowel Refresh erase a tile's feedback outright
  // (server sets fb[i]/fbGuesser[i] to "") rather than masking it behind a
  // placeholder -- without this check it fell into the fbToClass
  // "unrecognized symbol" fallback further down and rendered as a plain
  // gray tile, indistinguishable from (and actively misleading as) a
  // genuine "letter not in the word" result. Checked for both roles since
  // both fb and fbGuesser get erased together.
  if (fbArray[guessIndex] === "") {
    // All reset sources share one erased-feedback presentation.
    classes.push("tile-erased");
    return classes.join(" ");
  }
  // Feedback Lie: two randomly chosen tiles show a clean, wrong color and
  // the rest show the truth (see feedbackLieServer.js's entry.feedbackLie
  // side channel) -- every tile rendered as a plain colored tile like a
  // real result, so nothing marks which two are the lies. fbGuesser itself stays "❓"
  // (handled by the erased/uncertain fallback below) so the keyboard and
  // any AI reasoning never treat the lie as real evidence.
  if (!isSetter && Array.isArray(safeEntry.feedbackLie)) {
    const lieFb = safeEntry.feedbackLie[guessIndex];
    classes.push(`tile-${fbToClass(lieFb) || "gray"}`);
    return classes.join(" ");
  }
  // Faithful fbComposite branch
if (!isSetter && safeEntry.fakeFeedback?.entry1 && safeEntry.fakeFeedback?.entry2) {
  const fb1 = safeEntry.fakeFeedback.entry1[guessIndex];
  const fb2 = safeEntry.fakeFeedback.entry2[guessIndex];
  // deterministic
  if (fb1 === fb2) {
    if (fb1 === "🟩") classes.push("tile-green");
    else if (fb1 === "🟨") classes.push("tile-yellow");
    else if (fb1 === "🟦") classes.push("tile-blue");
    else classes.push("tile-gray");
  } 
  // uncertain → composite
  else {const c1 = fbToClass(fb1) || "gray";
        const c2 = fbToClass(fb2) || "gray";
        // Any unrecognized symbol falls back to gray rather than being
        // dropped -- an unstyled tile falls all the way through to the
        // page background (no color at all), which reads as solid black
        // instead of the "not in the word" look it's supposed to have.
        classes.push(`tile-${c1}-${c2}`);
        classes.push("tile-feedback-slide");
        }
  return classes.join(" ");
} else if (isSetter && !state.powers?.stealthGuessActive) {
    const isBlindSpotForSetter =
    typeof bsIdx === "number" &&
    typeof bsRound === "number" &&
    guessIndex === bsIdx &&
    entryRoundIndex >= bsRound;
    classes.push(...getSetterTileClasses(safeEntry, guessIndex, isBlindSpotForSetter));
    return classes.join(" ");
  }
  // Fallback to fbArray 
  const fb = fbArray[guessIndex];
  if (fb === "🟩") classes.push("tile-green");
  else if (fb === "🟨") classes.push("tile-yellow");
  else if (fb === "🟦") classes.push("tile-blue");
  else classes.push("tile-gray");
  return classes.join(" ");
}

///Build history
function buildHistoryRenderState(state, role) {
  // Total Blackout is a SETTER power that blinds the GUESSER's next guess
  // (see powerEngine/powers/blindGuess.js's role:"setter") -- blanking
  // this for BOTH roles left the setter unable to see their own board
  // either, and (combined with renderHistory's now-fixed shared
  // prevRenderState bug) made the setter's blanked render corrupt the
  // guesser's diff on whichever call ran second that tick.
  if (role === "guesser" && state.powers?.blindGuessActive) return [];
  const isSetter = role === "setter";
  // The guesser's own tile marks (client/key-color-picker.js) are scoped
  // to a round, and this render runs before the keyboard's on a guesser
  // update -- so ask for the round check here too rather than painting one
  // frame of last round's marks onto this round's rows. It is a no-op
  // unless the round actually changed.
  if (!isSetter) window.resetManualKeyColorsForRound?.(state);
  const bsIdx   = state?.powers?.blindSpotIndex;
  const bsRound = state?.powers?.blindSpotRoundIndex;
  const history = state?.history || [];
  const rows = [];
  let j = -1;
  for (const entry of history) {
    if (!entry?.guess) continue;
    j++;
    // stable key (prefer persisting on entry; adjust if you store elsewhere)
    entry.__historyKey ??= `h-${entry.roundIndex ?? j}`;
    const safeEntry = JSON.parse(JSON.stringify(entry));
    PowerEngine.applyHistoryEffects(safeEntry, isSetter);
    let fbArray;
    if (!isSetter && Array.isArray(safeEntry.fbGuesser)) fbArray = safeEntry.fbGuesser;
    else if (Array.isArray(safeEntry.fb)) fbArray = safeEntry.fb;
    else fbArray = ["⬛","⬛","⬛","⬛","⬛"];
    if (!Array.isArray(fbArray) || fbArray.length !== 5) continue;
    const guess = safeEntry.guess.toUpperCase();
    const tiles = [];
    for (let i = 0; i < 5; i++) {
      tiles.push({letter: guess[i], classKey: computeTileClassKey({ isSetter, entryRoundIndex: entry.roundIndex,guessIndex: i,bsIdx,bsRound, safeEntry, fbArray})});
    }
    // Count Only replaces per-tile feedback with just a green/yellow tally —
    // mark every tile in that row with a small "didn't know this" corner
    // mark (reusing the same annotation hideTile uses) and carry the tally
    // along so the row can show it without breaking the row's own
    // centering/alignment with every other row.
    let countOnlyInfo = null;
    if (safeEntry.extraInfo && safeEntry.countOnlyApplied) {
      countOnlyInfo = safeEntry.extraInfo;
      for (const tile of tiles) {
        tile.classKey = `${tile.classKey} tile-guesser-hidden`;
      }
    }
    // Feedback Lie: unlike Count Only, the tiles themselves already show
    // real-looking (but false) colors -- nothing to hide -- so this only
    // adds the row note that makes the deception legible instead of
    // reading as a genuine result.
    const feedbackLieInfo = !!safeEntry.feedbackLieApplied;

    // The guesser's own reading of a tile, dropped on from the palette
    // (client/key-color-picker.js). Applied last, after every real-feedback
    // branch above including Count Only's per-tile "?" corner: the mark
    // REPLACES the tile's class rather than layering over it, so a row the
    // player has already made their mind up about doesn't keep asking the
    // question underneath their answer. Folding it into classKey (rather
    // than patching the DOM separately) is what lets rowsEqual see a mark
    // change as a change and re-render the row for it.
    if (!isSetter) {
      for (let i = 0; i < tiles.length; i++) {
        const manual = window.getManualTileColor?.(entry.__historyKey, i);
        const manualClass = manual
          ? window.manualTileColorClass?.(manual)
          : null;
        if (manualClass) tiles[i].classKey = manualClass;
      }
    }

    // Alphabet Compass (server/powers/powers/alphabetCompassServer.js): for
    // the one turn it's active, every row trades its colors for the
    // server's reading of each tile against the secret -- green when it
    // matches, otherwise an arrow toward the secret's letter in that spot
    // (← earlier in the alphabet, → later). Applied last so it wins over
    // every other presentation, the player's own marks included; it goes
    // away by itself when the flag clears on submit.
    const compass = !isSetter && state.powers?.alphabetCompassActive
      ? state.powers.alphabetCompassRows?.[j]
      : null;
    if (Array.isArray(compass)) {
      for (let i = 0; i < tiles.length; i++) {
        const reading = compass[i];
        if (reading === "G") tiles[i].classKey = "history-tile tile-green tile-compass tile-compass-match";
        else if (reading === "L") tiles[i].classKey = "history-tile tile-compass tile-compass-left";
        else if (reading === "R") tiles[i].classKey = "history-tile tile-compass tile-compass-right";
      }
    }

    rows.push({
      key: entry.__historyKey,
      evaluated: !!safeEntry.extraInfo,
      countOnlyInfo,
      feedbackLieInfo,
      tiles
    });
  }
  return rows;
}

///Strict diffing algorithm
///Scroll-intent controller (shared by every history-scroll list: the
// Guesser's and Secretkeeper's feedback history, and any animation module
// that needs to append/move a row in one of them). A native touch drag has
// to reach the browser's own scrolling machinery untouched -- everything
// here only ever OBSERVES a gesture (passive listeners, never
// preventDefault) to decide whether a DOM mutation elsewhere is allowed to
// follow the list down to its newest row; it never drives the scrolling
// of a live gesture itself.
const HISTORY_SCROLL_STATE = new WeakMap();

// How close to the bottom still counts as "at the newest row". Small on
// purpose: the old one-row (56px) tolerance meant a small, deliberate
// upward drag was still read as "pinned to the bottom" and got yanked
// straight back down on the next update.
const HISTORY_BOTTOM_EPSILON_PX = 4;

// How long after the last touch/pointer/wheel event to still treat the
// list as being handled by the user -- covers the momentum/deceleration
// phase of a touch scroll, which keeps moving scrollTop well after the
// finger actually lifts. Ending the window too early let a state update
// arriving mid-momentum re-attach the list out from under it.
const HISTORY_SETTLE_MS = 150;

function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function historyDistanceFromBottom(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
}

function isHistoryScrolledToNewest(container) {
  if (!container) return true;
  // Not overflowing yet -> there is nowhere to have scrolled away to.
  return historyDistanceFromBottom(container) <= HISTORY_BOTTOM_EPSILON_PX;
}

// Genuinely nothing to scroll: every row fits in the box as it stands.
// Being "scrolled away" is meaningless here, so any stale detached flag
// from an earlier, taller list has to be dropped rather than left to
// suppress the follow-to-newest behaviour forever.
function historyHasNowhereToScroll(container) {
  return historyMaxScrollTop(container) <= HISTORY_BOTTOM_EPSILON_PX;
}

function historyMaxScrollTop(container) {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

// Exposed so other guesser-history callers (guesser-flow-v7.js's own
// pending-row scroll, outside this file's diff/render pipeline) can apply
// the exact same "only follow if already at the bottom" rule instead of
// each keeping its own copy of the threshold logic.
window.isHistoryScrolledToNewest = isHistoryScrolledToNewest;

function getHistoryScrollState(container) {
  let s = HISTORY_SCROLL_STATE.get(container);
  if (s) return s;

  s = {
    interacting: false,
    detached: false,
    settleTimer: null,
    lastScrollAt: 0,
    // Last position/scrollable range this controller actually observed,
    // so the next scroll event can be compared against them (see
    // landedAtBottomByClamping below).
    seenTop: container.scrollTop,
    seenMax: historyMaxScrollTop(container)
  };
  HISTORY_SCROLL_STATE.set(container, s);

  // Did the list arrive at the bottom because the BOX shrank out from
  // under the reader rather than because they scrolled there?
  //
  // Anything sharing the board column can take height out of this box --
  // the Secret Themes / Informant readout appearing below it is the usual
  // cause, and it is rebuilt and repositioned on ordinary state updates
  // for as long as the reward is held, so this happens over and over
  // rather than once. Each time the scrollable range shrinks past where
  // the reader was parked, the browser clamps scrollTop to the new
  // maximum by itself and dispatches a perfectly genuine scroll event for
  // it. Read literally that event says "the reader is at the newest row
  // now" -- which is how someone holding a position part-way up the list
  // silently lost their "scrolled away" flag and got dragged back down by
  // the very next resize, over and over, and why the list felt like it
  // refused to stay where it was put. The signature is exact: the range
  // is smaller than when we last looked, the position we last saw no
  // longer exists inside it, and we have landed on the new ceiling. A
  // timestamp set from the ResizeObserver can't stand in for this -- the
  // rendering steps fire scroll events BEFORE resize-observer callbacks,
  // so the stamp would always arrive a frame too late.
  const landedAtBottomByClamping = (top, max) =>
    max < s.seenMax && s.seenTop > max + HISTORY_BOTTOM_EPSILON_PX &&
    top >= max - HISTORY_BOTTOM_EPSILON_PX;

  const beginInteraction = () => {
    s.interacting = true;
    if (s.settleTimer) {
      clearTimeout(s.settleTimer);
      s.settleTimer = null;
    }
  };

  const endInteraction = () => {
    if (s.settleTimer) clearTimeout(s.settleTimer);
    s.settleTimer = setTimeout(() => {
      s.interacting = false;
      s.settleTimer = null;
      // Momentum settled. Whether it carried the reader back to the
      // newest row is already recorded -- every frame of that coast fires
      // a scroll event and the listener below judges each one -- so this
      // deliberately does NOT re-read the live geometry, which a resize
      // in the meantime may have moved the bottom of without the reader
      // touching anything. The one thing no scroll event can report is
      // the list ceasing to overflow at all, which leaves nothing to be
      // scrolled away from.
      if (historyHasNowhereToScroll(container)) s.detached = false;
    }, HISTORY_SETTLE_MS);
  };

  // Passive throughout -- never calls preventDefault, so this can only
  // ever observe a gesture, never interfere with the browser's own native
  // scrolling of this element.
  container.addEventListener("touchstart", beginInteraction, { passive: true });
  container.addEventListener("touchend", endInteraction, { passive: true });
  container.addEventListener("touchcancel", endInteraction, { passive: true });
  container.addEventListener("pointerdown", beginInteraction, { passive: true });
  container.addEventListener("pointerup", endInteraction, { passive: true });
  container.addEventListener("pointercancel", endInteraction, { passive: true });
  container.addEventListener("wheel", () => { beginInteraction(); endInteraction(); }, { passive: true });

  // The one source of truth for "has the reader scrolled away": any scroll
  // that leaves the list further than the epsilon from the bottom marks it
  // detached, whether it came from a touch drag, a wheel, or dragging the
  // scrollbar itself. A programmatic follow-to-bottom write (see
  // restoreHistoryScrollIntent below) always lands exactly at the bottom,
  // so it can never trip this into "detached" on its own. The one caller
  // that does have to be told apart is the box resizing under the reader:
  // that clamps scrollTop and fires a scroll event of its own, which
  // reads exactly like the reader choosing to come back down -- hence
  // landedAtBottomByClamping rather than a bare assignment here.
  container.addEventListener("scroll", () => {
    s.lastScrollAt = now();
    const top = container.scrollTop;
    const max = historyMaxScrollTop(container);

    if (!isHistoryScrolledToNewest(container)) {
      s.detached = true;
    } else if (historyHasNowhereToScroll(container)) {
      // Every row fits as things stand, so there is nowhere to be
      // scrolled away to and no stale flag worth keeping.
      s.detached = false;
    } else if (!landedAtBottomByClamping(top, max)) {
      s.detached = false;
    }
    // A finger on the list used to be taken as proof that reaching the
    // bottom was the reader's own doing, even when landedAtBottomByClamping
    // said the box had just shrunk out from under them. On the Guesser's
    // phone layout that is routine rather than rare: the quest card above
    // the list changes height as the draft changes (a condition chip
    // wrapping is enough), clamping a mid-list reader to the bottom while
    // they are still dragging, clearing "scrolled away", and letting the
    // next resize pin them to the newest row -- the list snapping back
    // that only happens while a quest is up. A genuine drag to the bottom
    // is not lost by dropping that exception: the gesture keeps firing
    // scroll events, and the very next one arrives with a stable range,
    // where landedAtBottomByClamping is false and this clears as usual.

    s.seenTop = top;
    s.seenMax = max;
  }, { passive: true });

  // This list's own height changes underneath the reader whenever anything
  // sharing the board column with it grows or shrinks -- most visibly a
  // Power Choice reward that pays out as a standing readout (Informant,
  // Secret Themes), whose panel appears between this list
  // and the draft row and takes ~80px straight out of this box. The rows
  // themselves don't move, so no scroll event fires and nothing else here
  // ever learns anything happened: a reader who was pinned to the newest
  // row is silently left that far above it, and every later render's
  // "hold" then faithfully preserves the wrong position -- which is why
  // the list read as stuck part-way up, with new rows piling up unseen
  // below, from the moment one of those rewards was taken. Re-pin to the
  // newest row on any resize, unless the reader had deliberately scrolled
  // away from it (exactly the rule the rest of this controller follows) --
  // which is what landedAtBottomByClamping above exists to keep true
  // across the repeated resizes that same panel causes while it is held.
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (s.detached || s.interacting) return;
      container.scrollTop = container.scrollHeight;
      s.seenTop = container.scrollTop;
      s.seenMax = historyMaxScrollTop(container);
    });
    observer.observe(container);
  }

  return s;
}

// Snapshot taken BEFORE a DOM mutation that might add/remove/patch rows --
// records whether the list is currently allowed to follow a newly-added
// row down to the bottom, plus its exact live scrollTop so a caller that
// ends up not following can positively hold that position instead of
// trusting that nothing else nudged it.
function captureHistoryScrollIntent(container) {
  if (!container) {
    return {
      eligible: true,
      scrollTop: 0,
      interacting: false,
      detached: false
    };
  }

  const s = getHistoryScrollState(container);

  return {
    eligible:
      !s.interacting &&
      !s.detached &&
      isHistoryScrolledToNewest(container),
    scrollTop: container.scrollTop,
    interacting: s.interacting,
    detached: s.detached
  };
}

// HISTORY_SCROLL_INPUT_OWNERSHIP_FIX_V1
// A render can arrive while the reader is dragging, wheel-scrolling, or
// coasting with touch momentum. In that case snapshot.scrollTop belongs to
// an older frame. Writing it back in the old "hold" branch fought the native
// gesture and could reset a just-started downward scroll to 0.
function restoreHistoryScrollIntent(container, snapshot, options = {}) {
  if (!container || !snapshot) return;

  const s = getHistoryScrollState(container);
  const capturedTop = Number.isFinite(snapshot.scrollTop)
    ? snapshot.scrollTop
    : container.scrollTop;
  const movedSinceCapture =
    Math.abs(container.scrollTop - capturedTop) >
    HISTORY_BOTTOM_EPSILON_PX;

  // Do not perform any programmatic scroll write when the user owned the
  // scroll at capture time, owns it now, newly detached after capture, or
  // moved an already non-following view before this restore ran.
  const userOwnsScroll =
    !!snapshot.interacting ||
    s.interacting ||
    (!snapshot.detached && s.detached) ||
    (!snapshot.eligible && movedSinceCapture);

  if (userOwnsScroll) return;

  const shouldFollow =
    options.follow !== false &&
    !!snapshot.eligible &&
    !s.detached;

  if (shouldFollow) {
    container.scrollTop = container.scrollHeight;
    return;
  }

  if (options.hold !== false) {
    // Keep the old feature for a stable, non-interacting view, but clamp the
    // value in case row removal reduced the scrollable range.
    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );

    container.scrollTop = Math.min(
      Math.max(0, capturedTop),
      maxScrollTop
    );
  }
}

window.captureHistoryScrollIntent = captureHistoryScrollIntent;
window.restoreHistoryScrollIntent = restoreHistoryScrollIntent;

function diffHistory(prev, next) {
  const prevMap = new Map(prev.map(r => [r.key, r]));
  const nextMap = new Map(next.map(r => [r.key, r]));
  return {
    added: next.filter(r => !prevMap.has(r.key)),
    removed: prev.filter(r => !nextMap.has(r.key)),
    updated: next.filter(r => {
      const p = prevMap.get(r.key);
      return p && !rowsEqual(p, r);
    })
  };
}

function rowsEqual(a, b) {
  if (a.evaluated !== b.evaluated) return false;
  if (!!a.countOnlyInfo !== !!b.countOnlyInfo) return false;
  if (a.countOnlyInfo && b.countOnlyInfo) {
    if (a.countOnlyInfo.greens !== b.countOnlyInfo.greens) return false;
    if (a.countOnlyInfo.yellows !== b.countOnlyInfo.yellows) return false;
  }
  if (!!a.feedbackLieInfo !== !!b.feedbackLieInfo) return false;
  for (let i = 0; i < 5; i++) {
    if (a.tiles[i].letter   !== b.tiles[i].letter || a.tiles[i].classKey !== b.tiles[i].classKey) return false;
  }
  return true;
}

// Count Only tally, anchored beside its row without affecting the row's
// own centering — the anchor is already `position: relative`, so this
// badge is pulled out of flow instead of sitting in the centered flexbox.
function createCountOnlyBadge({ greens, yellows }) {
  const badge = document.createElement("div");
  badge.className = "count-only-badge";
  badge.innerHTML = `
    <span class="count-only-chip count-only-green">
      <span class="count-only-chip-dot">G</span>
      <span class="count-only-value">${greens}</span>
    </span>
    <span class="count-only-chip count-only-yellow">
      <span class="count-only-chip-dot">Y</span>
      <span class="count-only-value">${yellows}</span>
    </span>
  `;
  return badge;
}

// Feedback Lie note, anchored beside its row the same way the Count Only
// tally is -- there's no count to show, just a flag that every tile in
// this row is a false color rather than a genuine result.
function createFeedbackLieBadge() {
  const badge = document.createElement("div");
  badge.className = "feedback-lie-badge";
  badge.innerHTML = `
    <span class="feedback-lie-chip">
      <span class="feedback-lie-chip-dot">!</span>
      <span class="feedback-lie-chip-label">Lie</span>
    </span>
  `;
  return badge;
}

///DOM creator
function createHistoryRowDOM(row) {
  const wrap = document.createElement("div");
  wrap.className = "history-row-wrap row-enter";
  wrap.dataset.key = row.key;

  const anchor = document.createElement("div");
  anchor.className = "history-row-anchor";

  const rowEl = document.createElement("div");
  rowEl.className = "history-row";

  if (row.evaluated) {
    rowEl.classList.add("evaluated-row");
  }

  for (const tile of row.tiles) {
    const el = document.createElement("div");
    el.className = tile.classKey;
    el.dataset.letter = tile.letter;

    const letter = document.createElement("span");
    letter.className = "tile-letter";
    letter.textContent = tile.letter;

    const cover = document.createElement("span");
    cover.className = "history-tile-cover";
    cover.dataset.letter = tile.letter;
    cover.setAttribute("aria-hidden", "true");

    el.append(letter, cover);
    rowEl.appendChild(el);
  }

  anchor.appendChild(rowEl);

  if (row.countOnlyInfo) {
    anchor.appendChild(
      createCountOnlyBadge(row.countOnlyInfo)
    );
  }

  if (row.feedbackLieInfo) {
    anchor.appendChild(
      createFeedbackLieBadge()
    );
  }

  wrap.appendChild(anchor);
  return wrap;
}

function patchHistoryRow(wrap, row) {
  const rowEl = wrap.querySelector(".history-row");
  if (!rowEl) return;

  rowEl.classList.toggle(
    "evaluated-row",
    !!row.evaluated
  );

  const tiles = rowEl.querySelectorAll(
    ":scope > .history-tile"
  );

  for (let i = 0; i < 5; i++) {
    const tileEl = tiles[i];
    const tileState = row.tiles[i];

    if (!tileEl || !tileState) continue;

    tileEl.className = tileState.classKey;
    tileEl.dataset.letter = tileState.letter;

    let letter = tileEl.querySelector(".tile-letter");

    if (!letter) {
      letter = document.createElement("span");
      letter.className = "tile-letter";
      tileEl.prepend(letter);
    }

    letter.textContent = tileState.letter;

    const cover = tileEl.querySelector(
      ".history-tile-cover"
    );

    if (cover) {
      cover.dataset.letter = tileState.letter;
    }
  }

  const anchor = wrap.querySelector(
    ".history-row-anchor"
  );

  let badge = anchor?.querySelector(
    ".count-only-badge"
  );

  if (row.countOnlyInfo) {
    if (!badge) {
      anchor?.appendChild(
        createCountOnlyBadge(row.countOnlyInfo)
      );
    } else {
      badge.querySelector(
        ".count-only-green .count-only-value"
      ).textContent =
        row.countOnlyInfo.greens;

      badge.querySelector(
        ".count-only-yellow .count-only-value"
      ).textContent =
        row.countOnlyInfo.yellows;
    }
  } else {
    badge?.remove();
  }

  const feedbackLieBadge = anchor?.querySelector(
    ".feedback-lie-badge"
  );

  if (row.feedbackLieInfo) {
    if (!feedbackLieBadge) {
      anchor?.appendChild(
        createFeedbackLieBadge()
      );
    }
  } else {
    feedbackLieBadge?.remove();
  }
}

function finishHistoryReveal(wrap) {
  if (!wrap) return;

  clearTimeout(wrap.__revealTimer);

  wrap.classList.remove(
    "reveal-waiting",
    "reveal-tiles"
  );

  wrap.querySelectorAll(
    ".history-tile-cover"
  ).forEach(el => el.remove());
}

function revealHistoryRow(wrap) {
  if (
    !wrap ||
    !wrap.isConnected ||
    wrap.__revealStarted
  ) {
    return;
  }

  wrap.__revealStarted = true;
  wrap.classList.remove("reveal-waiting");

  if (
    window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
  ) {
    finishHistoryReveal(wrap);
    return;
  }

  wrap.classList.remove("reveal-tiles");
  void wrap.offsetWidth;
  wrap.classList.add("reveal-tiles");

  const lastTile = wrap.querySelector(
    ".history-tile:last-child"
  );

  const onEnd = event => {
    if (
      event.target !== lastTile ||
      event.animationName !== "history-wordle-flip"
    ) {
      return;
    }

    lastTile.removeEventListener(
      "animationend",
      onEnd
    );

    finishHistoryReveal(wrap);
  };

  lastTile?.addEventListener(
    "animationend",
    onEnd
  );

  wrap.__revealTimer = setTimeout(
    () => finishHistoryReveal(wrap),
    1400
  );
}

window.revealHistoryRow = revealHistoryRow;

/// History renderer
window.renderHistory = function ({
  state,
  container,
  role,
  autoScroll = true,
  deferRevealWord = ""
}) {
  const prev =
    container.__prevRenderState || [];

  const next =
    buildHistoryRenderState(state, role);

  const diff =
    diffHistory(prev, next);

  const addedElements = [];
  const revealNow = [];

  let deferredMatchUsed = false;

  // Captured before any DOM mutation below -- appending/removing rows
  // changes scrollHeight, so measuring after the fact would make an
  // at-the-bottom reader look scrolled-away every single time. Returned
  // alongside the render result so an animation caller (a pending-row
  // insert, a flight) can reuse this exact pre-mutation snapshot instead
  // of measuring again after the DOM has already moved on.
  const scrollIntent = captureHistoryScrollIntent(container);

  for (const row of diff.removed) {
    container
      .querySelector(`[data-key="${row.key}"]`)
      ?.remove();
  }

  for (const row of diff.updated) {
    const el = container.querySelector(
      `[data-key="${row.key}"]`
    );

    if (el) {
      patchHistoryRow(el, row);
    }
  }

  for (const row of diff.added) {
    const el = createHistoryRowDOM(row);

    const word = row.tiles
      .map(tile => tile.letter)
      .join("");

    const shouldDefer =
      !deferredMatchUsed &&
      !!deferRevealWord &&
      word === deferRevealWord;

    if (shouldDefer) {
      deferredMatchUsed = true;
      el.classList.add("reveal-waiting");
    } else {
      revealNow.push(el);
    }

    container.appendChild(el);
    addedElements.push(el);
  }

  if (revealNow.length) {
    requestAnimationFrame(() => {
      revealNow.forEach(revealHistoryRow);
    });
  }

  // Follow the newest row only for a reader who was already sitting at the
  // bottom and isn't mid-gesture right now (see restoreHistoryScrollIntent).
  // Someone who deliberately scrolled up to re-read earlier guesses gets
  // left exactly where they are -- an opponent's guess landing used to
  // yank them straight back down mid-read, since this fired on every
  // append regardless of where they were looking. Runs even when nothing
  // was added (an update/removal only) so the held position gets
  // positively reasserted rather than left to chance.
  if (diff.added.length || diff.removed.length || diff.updated.length) {
    restoreHistoryScrollIntent(container, scrollIntent, {
      follow: addedElements.length > 0 && autoScroll
    });
  }

  container.__prevRenderState = next;

  return {
    diff,
    addedElements,
    scrollIntent
  };
};

///Helper for uncertain feedback

function fbToClass(fb) {
  if (fb === "🟩") return "green";
  if (fb === "🟨") return "yellow";
  if (fb === "🟦") return "blue";
  if (fb === "🟪") return "purple";
  if (fb === "⬛") return "gray";
  return null;
}

function getSetterTileClasses(safeEntry, guessIndex, isBlindSpot) {
  const classes = [];

  // --- TRUE feedback (always) ---
  const trueFb = safeEntry.fb?.[guessIndex];
  // Falls back to gray rather than leaving the tile with no color class at
  // all -- an unstyled tile falls through to the page background (no
  // color), which reads as solid black instead of "not in the word".
  const trueClass = fbToClass(trueFb) || "gray";
  classes.push(`tile-${trueClass}`);
  let secondaryClass = null;
  // --- Case 1: fakeFeedback ambiguity ---
  const entry1 = safeEntry.fakeFeedback?.entry1?.[guessIndex];
  const entry2 = safeEntry.fakeFeedback?.entry2?.[guessIndex];
  if (entry1 && entry2 && entry1 !== entry2) {
    const secondaryFb =
      entry1 === trueFb ? entry2 :
      entry2 === trueFb ? entry1 :
      null;
    if (secondaryFb) {
      secondaryClass = fbToClass(secondaryFb);
    }
  }
  // --- Case 1b: Feedback Lie -- show the setter what the guesser was
  // shown, same as fakeFeedback's ambiguity hint above. Only the lied
  // tiles differ from the truth (a lied tile never matches it by
  // construction -- see feedbackLieServer.js's buildLieFeedback), so this
  // marks exactly the two the setter's power falsified. ---
  const lieFb = safeEntry.feedbackLie?.[guessIndex];
  if (lieFb && lieFb !== trueFb) {
    secondaryClass = fbToClass(lieFb);
  }
  // --- Case 2: guesser sees special feedback (blue) ---
  const guesserFb = safeEntry.fbGuesser?.[guessIndex];
  const guesserClass = fbToClass(guesserFb);
  if (guesserClass === "blue" || guesserClass === "purple") {
    secondaryClass = guesserClass;
  }
  if (isBlindSpot) {
    secondaryClass = "purple";
  }
  // --- Apply secondary if any ---
  if (secondaryClass) {
    classes.push(`secondary-${secondaryClass}`);
    classes.push("tile-has-secondary");
  }
  return classes;
}

