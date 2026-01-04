///Main updating function

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

function getRemainingWordInfo(state, newSecret) {
  if (!state || state.phase === "simultaneous" || state.phase === "lobby" || state.phase === "gameOver") {
    return null;
  }

  const lastIdx = state.history.length - 1;
  if (lastIdx < 0) return null;

  // current
 const current = computeRemainingAfterIndex(lastIdx);

  let oldCount = -1;
  let newCount = -1;

  const guess = state.pendingGuess;
  const guessIsComplete = guess && !guess.includes("?");

  if (guessIsComplete) {
    oldCount = computeRemainingNew(state.secret);
    if (newSecret && newSecret.length === 5) {
      newCount = computeRemainingNew(newSecret);
    } else {
      newCount = -1;
    }
  } else if (!guessIsComplete){
    oldCount = -1;
    newCount = -1;
  }
  return {
    current,
    old: oldCount,
    new: newCount
  };
}
function renderSetterRemainingBox(state, role, draft) {
  const box = document.getElementById("SetterRemainingBox");
  if (!box) return;

  if (!state || state.phase !== "normal") {
    box.innerHTML = "";
    return;
  }

  // Only setter sees it
  if (role !== state.setter) {
    box.innerHTML = "";
    return;
  }

  const info = getRemainingWordInfo(state, draft);
  if (!info || info.current == null) {
    box.innerHTML = "";
    return;
  }

  const hasOld = info.old > -1;
  const hasNew = info.new > -1;

  let oldStyle = "";
  let newStyle = "";

  if (hasOld && hasNew) {
    if (info.old > info.new) oldStyle = "color: var(--tile-green)";
    else if (info.new > info.old) newStyle = "color: var(--tile-green)";
  }

  box.innerHTML = `
    <div class="line">
      <span class="label">Words</span>
      <span class="value">${info.current.toLocaleString()}</span>
    </div>
    <div class="line">
      <span class="label">Keep</span>
      <span class="value" style="${oldStyle}">
        ${hasOld ? info.old.toLocaleString() : "?"}
      </span>
    </div>
    <div class="line">
      <span class="label">New</span>
      <span class="value" style="${newStyle}">
        ${hasNew ? info.new.toLocaleString() : "?"}
      </span>
    </div>
  `;
}


