///Main updating function
function updateRemainingWords(newSecret) {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    return null;
  }

  const lastIdx = state.history.length - 1;
  if (lastIdx < 0) return null;

  if (remainingCache.setterCurrent == null) {
    remainingCache.setterCurrent = computeRemainingAfterIndex(lastIdx);
  }

  const current = remainingCache.setterCurrent;

  let oldCount = null;
  let newCount = null;

  const guess = state.pendingGuess;
  const guessIsComplete = guess && !guess.includes("?");

  if (guessIsComplete) {
    if (remainingCache.setterOld == null) {
      remainingCache.setterOld = computeRemainingNew(state.secret);
    }
    oldCount = remainingCache.setterOld;

    if (newSecret && newSecret.length === 5) {
      newCount = computeRemainingNew(newSecret);
    }
  }

  return { current, oldCount, newCount };
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
  if (!state || !state.history || !Guess || Guess.includes("?")) {
    return null;
  }
  const fb = scoreGuess(newWord.toLowerCase(),Guess.toLowerCase());

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
  setterCurrent: null,
  setterOld: null
};

///Render remaining words
function renderRemaining(element, countcurrent, countold, countnew) {
  if (!element || countcurrent == null) return;

  const current = Number(countcurrent);

  const hasOld = typeof countold === "number";
  const oldLoss = hasOld ? countold : null;

  const hasNew = typeof countnew === "number";
  const newLoss = hasNew ? countnew : null;

  element.innerHTML = `
    <span class="remaining-current">
      Words remaining: ${current.toLocaleString()}
    </span>
    <span class="remaining-old">
      Keep: ${hasOld ? oldLoss.toLocaleString() : "-"}
    </span>
    <span class="remaining-new">
      New: ${hasNew ? newLoss.toLocaleString() : "-"}
    </span>
  `;

  if (!hasOld || !hasNew) return;

  const oldEl = element.querySelector(".remaining-old");
  const newEl = element.querySelector(".remaining-new");

  if (oldLoss > newLoss) {
    oldEl.classList.add("better");
  } else if (newLoss > oldLoss) {
    newEl.classList.add("better");
  }
}


