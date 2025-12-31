///Main updating function
function updateRemainingWords(newSecret) {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    const el = $("remainingInfoSetter");
    if (el) el.innerHTML = "";
    return;
  }

  const el = $("remainingInfoSetter");
  if (!el) return;

  const lastIdx = state.history.length - 1;
  if (lastIdx < 0) return;

  // Current remaining
  if (remainingCache.setter == null) {
    remainingCache.setter = computeRemainingAfterIndex(lastIdx);
  }
  const countCurrent = remainingCache.setter;

  // Old (keep current secret)
  const countOld = computeRemainingNew(state.secret);

  // New (hypothetical) — default to null
  let countNew = null;
  if (
    typeof newSecret === "string" &&
    newSecret.length === 5 &&
    !newSecret.includes("?") &&
    state.pendingGuess
  ) {
    countNew = computeRemainingNew(newSecret);
  }

  renderRemaining(el, countCurrent, countOld, countNew);
}


///Calculate remaining words
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

window.computeRemainingNew = function (newWord) {
  const words = window.ALLOWED_SECRETS;
  const Guess = state.pendingGuess;
  if (!state || !state.history || !Guess) return 0;

  const fb = scoreGuess(
    Guess.toLowerCase(),
    newWord.toLowerCase()
  );

  const newHistory = {
    guess: Guess,
    fb,
    ignoreConstraints: false
  };

  const testHistory = [...state.history, newHistory];

  let count = 0;
  for (const w of words) {
    if (isConsistentWithHistory(testHistory, w, state)) {
      count++;
    }
  }
  return count;
};

// cache lives outside, but is reset on state updates
const remainingCache = {
  setter: null
};

///Render remaining words
function renderRemaining(element, countcurrent, countold, countnew) {
  if (!element || countcurrent == null || countold == null) return;

  const current = Number(countcurrent);
  const oldLoss = Number(countold) - current;

  const hasNew = typeof countnew === "number";
  const newLoss = hasNew ? countnew - current : null;

  element.innerHTML = `
    <span class="remaining-current">
      Words remaining: ${current.toLocaleString()}
    </span>,
    <span class="remaining-old">
      Keep: ${oldLoss.toLocaleString()}
    </span>,
    <span class="remaining-new">
      New: ${hasNew ? newLoss.toLocaleString() : "?"}
    </span>
  `;

  if (!hasNew) return;

  const oldEl = element.querySelector(".remaining-old");
  const newEl = element.querySelector(".remaining-new");

  if (oldLoss > newLoss) {
    oldEl.classList.add("better");
  } else if (newLoss > oldLoss) {
    newEl.classList.add("better");
  }
}

