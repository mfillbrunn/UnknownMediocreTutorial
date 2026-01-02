///Main updating function
function updateRemainingWords(newSecret) {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    return null;
  }

  const lastIdx = (state.history?.length ?? 0) - 1;

  if (remainingCache.setterCurrent == null) {
    remainingCache.setterCurrent = computeRemainingAfterIndex(lastIdx);
  }

  const current = remainingCache.setterCurrent;

  let oldCount = -1;
  let newCount = -1;

  const guess = state.pendingGuess;
  const guessIsComplete = typeof guess === "string" && !guess.includes("?");

  if (guessIsComplete) {
    oldCount = computeRemainingNew(state.secret);

    if (typeof newSecret === "string" && newSecret.length === 5) {
      newCount = computeRemainingNew(newSecret);
    }
  }

  return { current, oldCount, newCount };
}


InfoBadgeEngine.register((state, role) => {
  if (role !== state.setter) return null;
  const data = updateRemainingWords(state.secret);
  if (!data) return null;
  let { current, oldCount, newCount } = data;
  let share = "";
if (oldCount !== -1 && newCount !== -1) {
    if (oldCount > newCount) {
      share = `# Words: ${current.toLocaleString()}, 
        Keep: <span style="color: var(--tile-green); font-weight:900;">
          ${oldCount.toLocaleString()}
        </span>, 
        New: ${newCount.toLocaleString()}`;
    } else if (newCount > oldCount) {
      share = `# Words: ${current.toLocaleString()}, 
        Keep: ${oldCount.toLocaleString()}, 
        New: <span style="color: var(--tile-green); font-weight:900;">
          ${newCount.toLocaleString()}
        </span>`;
    } else {
      share = `# Words: ${current.toLocaleString()}, 
        Keep: ${oldCount.toLocaleString()}, 
        New: ${newCount.toLocaleString()}`;
    }
  } else if (oldCount !== -1 && newCount === -1) {
    share = `# Words: ${current.toLocaleString()}, 
      Keep: ${oldCount.toLocaleString()}, 
      New: -`;
  } else {
    share = `# Words: ${current.toLocaleString()}, 
      Keep: -, 
      New: -`;
  }

  return [
    {
      id: "remaining-words",
      text: share,
      priority: 0,
      screen: "setter"
    };
  ];
});

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
window.remainingCache = {
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


