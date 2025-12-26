
window.computeRemainingAfterIndexForRole = function (idx) {
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


function updateRemainingWords() {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    $("remainingWordsSetter").textContent = "-";
    $("remainingWordsGuesser").textContent = "-";
    styleRemaining($("remainingWordsSetter"), null);
    styleRemaining($("remainingWordsGuesser"), null);
    return;
  }
  const lastIdx = state.history.length;
  // compute once per update
  if (remainingCache.guesser === null) {
    remainingCache.setter =computeRemainingAfterIndexForRole(lastIdx);
  }
  if (remainingCache.setter === null) {
    remainingCache.setter =computeRemainingAfterIndexForRole(lastIdx);
  }

  const nGuesser = remainingCache.guesser;
  const nSetter  = remainingCache.setter;
  const categorySetter  = categorizeRemainingWords(nSetter);

  // Guesser sees exact number
  const g = $("remainingWordsGuesser");
  if (g) {
    g.textContent = Number(nGuesser).toLocaleString();
  }
  // Setter sees category
  const s = $("remainingWordsSetter");
  if (s) {
    s.textContent = Number(nSetter).toLocaleString();
    //s.textContent = categorySetter;
    //styleRemaining(s, categorySetter);
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
