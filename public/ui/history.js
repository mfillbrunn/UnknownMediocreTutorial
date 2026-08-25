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

    rows.push({
      key: entry.__historyKey,
      evaluated: !!safeEntry.extraInfo,
      countOnlyInfo,
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

function historyDistanceFromBottom(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight;
}

function isHistoryScrolledToNewest(container) {
  if (!container) return true;
  // Not overflowing yet -> there is nowhere to have scrolled away to.
  return historyDistanceFromBottom(container) <= HISTORY_BOTTOM_EPSILON_PX;
}

// Exposed so other guesser-history callers (guesser-flow-v7.js's own
// pending-row scroll, outside this file's diff/render pipeline) can apply
// the exact same "only follow if already at the bottom" rule instead of
// each keeping its own copy of the threshold logic.
window.isHistoryScrolledToNewest = isHistoryScrolledToNewest;

function getHistoryScrollState(container) {
  let s = HISTORY_SCROLL_STATE.get(container);
  if (s) return s;

  s = { interacting: false, detached: false, settleTimer: null };
  HISTORY_SCROLL_STATE.set(container, s);

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
      // Momentum settled -- if it actually carried the reader back to the
      // bottom on its own, resume following from here.
      if (isHistoryScrolledToNewest(container)) s.detached = false;
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
  // so it can never trip this into "detached" on its own -- nothing else
  // needs to distinguish who caused a given scroll.
  container.addEventListener("scroll", () => {
    s.detached = !isHistoryScrolledToNewest(container);
  }, { passive: true });

  return s;
}

// Snapshot taken BEFORE a DOM mutation that might add/remove/patch rows --
// records whether the list is currently allowed to follow a newly-added
// row down to the bottom, plus its exact live scrollTop so a caller that
// ends up not following can positively hold that position instead of
// trusting that nothing else nudged it.
function captureHistoryScrollIntent(container) {
  if (!container) {
    return { eligible: true, scrollTop: 0 };
  }
  const s = getHistoryScrollState(container);
  return {
    eligible: !s.interacting && !s.detached && isHistoryScrolledToNewest(container),
    scrollTop: container.scrollTop
  };
}

// Applies the follow-or-hold decision from a snapshot returned by
// captureHistoryScrollIntent(). Re-checks the LIVE interaction/detached
// state rather than trusting the snapshot alone, so a gesture that begins
// after the snapshot was taken but before this runs (the next animation
// frame, say) still correctly cancels the follow. Never uses smooth/
// animated scrolling: a CSS/JS-driven scroll animation racing an
// in-progress native touch scroll is exactly what made the list feel like
// it was snapping around underneath a real gesture.
function restoreHistoryScrollIntent(container, snapshot, options = {}) {
  if (!container || !snapshot) return;
  const s = getHistoryScrollState(container);
  const shouldFollow =
    options.follow !== false &&
    !!snapshot.eligible &&
    !s.interacting &&
    !s.detached;

  if (shouldFollow) {
    container.scrollTop = container.scrollHeight;
  } else if (options.hold !== false) {
    // Not following: hold exactly where the reader was before this
    // mutation ran, rather than leaving it to whatever the layout reflow
    // happened to land on.
    container.scrollTop = snapshot.scrollTop;
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



function resetHistoryRenderer(container) {
  container.__prevRenderState = [];
  container.innerHTML = "";
  // A fresh round starts attached to the bottom -- an empty list can't be
  // "scrolled away" from, and any mid-gesture flag left over from the
  // previous round's list no longer applies to it.
  HISTORY_SCROLL_STATE.delete(container);
}
