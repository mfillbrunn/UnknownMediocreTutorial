
window.computeRemainingAfterIndex = function (idx) {
  const words = window.ALLOWED_SECRETS;
  if (!state || !state.history) return 0;
  const partialHistory = state.history.slice(0, idx + 1);
  let count = 0;
  for (const w of words) {
    if (isConsistentWithHistory(partialHistory, w, state)) {
      count++;
    }
  }
  return count;
};

window.computeRemainingNew = function (newWord, Guess) {
  const words = window.ALLOWED_SECRETS;
  if (!state || !state.history) return 0;
  const newFb= scoreGuess(newWord.toLowerCase(),Guess.toLowerCase());
  const newHistory = {
    guess: Guess,
    fb: newFb,
    ignoreConstraints: false
  };
  let count = 0;
  const testHistory = [...state.history, newHistory];
  for (const w of words) {
    if (isConsistentWithHistory(testHistory, w, state)) {
      count++;
    }
  }
  return count;
}

function updateRemainingWords() {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    const el = $("remainingInfoSetter");
    if (el) el.innerHTML = "";
    return;
  }

  const el = $("remainingInfoSetter");
  if (!el) return;

  const lastIdx = state.history.length - 1;
  if (lastIdx < 0) return;

  // Current remaining (after last confirmed history)
  if (remainingCache.setter == null) {
    remainingCache.setter = computeRemainingAfterIndex(lastIdx);
  }
  const countCurrent = remainingCache.setter;

  // Old = before last guess
  const countOld =
    lastIdx > 0
      ? computeRemainingAfterIndex(lastIdx - 1)
      : window.ALLOWED_SECRETS.length;

  // New = hypothetical alternative (if applicable)
  let countNew = null;
  if (state.pendingNewGuess) {
    countNew = computeRemainingNew(
      state.pendingNewGuess,
      state.history[lastIdx].guess
    );
  }

  renderRemaining(el, countCurrent, countOld, countNew);
}

// cache lives outside, but is reset on state updates
const remainingCache = {
  setter: null
};

function renderRemaining(element, countcurrent, countold, countnew) {
  if (!element || countcurrent == null || countold == null) return;

  const current = Number(countcurrent);
  const oldLoss = Number(countold) - current;

  let newLoss = null;
  if (countnew != null) {
    newLoss = Number(countnew) - current;
  }

  // Build HTML
  let html = `
    <span class="remaining-current">
      Words remaining: ${current.toLocaleString()}
    </span>,
    <span class="remaining-old" data-value="${oldLoss}">
      Keep: ${oldLoss.toLocaleString()}
    </span>,
    <span class="remaining-new" data-value="${newLoss ?? "?"}">
      New: ${newLoss != null ? newLoss.toLocaleString() : "?"}
    </span>
  `;

  element.innerHTML = html;

  // Highlight logic
  const oldEl = element.querySelector(".remaining-old");
  const newEl = element.querySelector(".remaining-new");

  if (newLoss != null) {
    if (oldLoss > newLoss) {
      oldEl.classList.add("better");
    } else if (newLoss > oldLoss) {
      newEl.classList.add("better");
    }
  }
}
