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
  const isHiddenCycling =
    !isSetter &&
    Array.isArray(safeEntry.hiddenIndices) &&
    safeEntry.hiddenIndices.includes(guessIndex);
  if (isHiddenCycling) {
    classes.push("tile-hidden-cycle");
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
  else {const c1 = fbToClass(fb1);
        const c2 = fbToClass(fb2);
        if (c1 && c2) {classes.push(`tile-${c1}-${c2}`); 
                   classes.push("tile-feedback-slide"); 
                      }
        }
  return classes.join(" ");
} else if (isSetter && !state.powers?.stealthGuessActive) {
    const isHiddenCycling_setter =
    Array.isArray(safeEntry.hiddenIndices) &&
    safeEntry.hiddenIndices.includes(guessIndex);
    const isBlindSpotForSetter =
    typeof bsIdx === "number" &&
    typeof bsRound === "number" &&
    guessIndex === bsIdx &&
    entryRoundIndex >= bsRound;
    classes.push(...getSetterTileClasses(safeEntry, guessIndex, isBlindSpotForSetter,isHiddenCycling_setter ));
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
  if (state.powers?.blindGuessActive) return [];
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
    <span class="count-only-green">G:${greens}</span>
    <span class="count-only-yellow">Y:${yellows}</span>
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
  if (row.evaluated) rowEl.classList.add("evaluated-row");
  for (const tile of row.tiles) {
    const el = document.createElement("div");
    el.className = tile.classKey;
    const span = document.createElement("span");
    span.className = "tile-letter";
    span.textContent = tile.letter;
    el.appendChild(span);
    rowEl.appendChild(el);
  }
  anchor.appendChild(rowEl);
  if (row.countOnlyInfo) {
    anchor.appendChild(createCountOnlyBadge(row.countOnlyInfo));
  }
  wrap.appendChild(anchor);
  return wrap;
}

function patchHistoryRow(wrap, row) {
  const rowEl = wrap.querySelector(".history-row");
  rowEl.classList.add("evaluated-row");
  const tiles = rowEl.children;
  for (let i = 0; i < 5; i++) {
    const t = tiles[i];
    if (t.textContent !== row.tiles[i].letter) {
      t.textContent = row.tiles[i].letter;
    }
    if (t.className !== row.tiles[i].classKey) {
      t.className = row.tiles[i].classKey;
    }
  }

  const anchor = wrap.querySelector(".history-row-anchor");
  let badge = anchor?.querySelector(".count-only-badge");
  if (row.countOnlyInfo) {
    if (!badge) {
      anchor.appendChild(createCountOnlyBadge(row.countOnlyInfo));
    } else {
      badge.querySelector(".count-only-green").textContent = `G:${row.countOnlyInfo.greens}`;
      badge.querySelector(".count-only-yellow").textContent = `Y:${row.countOnlyInfo.yellows}`;
    }
  } else if (badge) {
    badge.remove();
  }
}

/// History renderer
let prevRenderState = [];
window.renderHistory = function ({ state, container, role }) {
  const next = buildHistoryRenderState(state, role);
  const diff = diffHistory(prevRenderState, next);
  // Remove
  for (const r of diff.removed) {
    const el = container.querySelector(`[data-key="${r.key}"]`);
    el?.remove();
  }
  // Update
  for (const r of diff.updated) {
    const el = container.querySelector(`[data-key="${r.key}"]`);
    if (el) patchHistoryRow(el, r);
  }
  // Add (append in order)
  for (const r of diff.added) {
    container.appendChild(createHistoryRowDOM(r));
  }
  prevRenderState = next;
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

function getSetterTileClasses(safeEntry, guessIndex, isBlindSpot, isHiddenCycling) {
  const classes = [];
  // --- TRUE feedback (always) ---
  const trueFb = safeEntry.fb?.[guessIndex];
  const trueClass = fbToClass(trueFb);
  if (trueClass) {
    classes.push(`tile-${trueClass}`);
  }
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
  if (isHiddenCycling) {
    classes.push("tile-guesser-hidden");
  }
  return classes;
}



function resetHistoryRenderer(container) {
  prevRenderState = [];
  container.innerHTML = "";
}
