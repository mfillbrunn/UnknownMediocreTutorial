
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
    $("remainingWordsSetter").textContent = "-";
    styleRemaining($("remainingWordsSetter"), null);
    return;
  }
  const lastIdx = state.history.length;
  if (remainingCache.setter === null) {
    remainingCache.setter =computeRemainingAfterIndex(lastIdx);
  }
  const nSetter  = remainingCache.setter;
  const categorySetter  = categorizeRemainingWords(nSetter);
  const s = $("remainingWordsSetter");
  if (s) {
    styleRemaining(s, categorySetter);
     renderRemaining(s, nSetter);
  }
}
  // Setter labeling
function categorizeRemainingWords(count) {
  if (count >= 200) return "many";
  if (count >= 50) return "plenty";
  if (count >= 10) return "some";
  if (count >= 2) return "few";
  if (count === 1) return "only one";
  return "none";
}
function styleRemaining(element, label) {
  element.className = "remainingMeter";
  if (!label) return;

  if (label === "many") element.classList.add("rm-many");
  else if (label === "plenty") element.classList.add("rm-plenty");
  else if (label === "some") element.classList.add("rm-some");
  else if (label === "few") element.classList.add("rm-few");
  else if (label === "only one") element.classList.add("rm-one");
}

// cache lives outside, but is reset on state updates
const remainingCache = {
  setter: null,
  guesser: null
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
