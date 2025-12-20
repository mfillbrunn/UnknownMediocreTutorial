
function categorizeRemainingWords(count) {
  if (count >= 200) return "many";
  if (count >= 50) return "plenty";
  if (count >= 10) return "some";
  if (count >= 2) return "few";
  if (count === 1) return "only one";
  return "none"; // edge-case: impossible or broken history
}
function computeRemainingWords() {
  const words = window.ALLOWED_SECRETS;
  if (!state || !state.history) return 0;

  let count = 0;
  for (const w of words) {
    if (isConsistentWithHistory(state.history, w, state)) {
      count++;
    }
  }
  return count;
}
function styleRemaining(element, label) {
  element.className = "remainingMeter"; // reset

  if (label === "many") element.classList.add("rm-many");
  else if (label === "plenty") element.classList.add("rm-plenty");
  else if (label === "some") element.classList.add("rm-some");
  else if (label === "few") element.classList.add("rm-few");
  else if (label === "only one") element.classList.add("rm-one");
}

function updateRemainingWords() {
  if (!state || state.phase === "lobby" || state.phase === "gameOver") {
    $("remainingWordsSetter").textContent = "-";
    $("remainingWordsGuesser").textContent = "-";
    styleRemaining($("remainingWordsSetter"), null);
    styleRemaining($("remainingWordsGuesser"), null);
    return;
  }

  const n = computeRemainingWords();
  const category = categorizeRemainingWords(n);

  // Guesser sees exact number + animation
  const g = $("remainingWordsGuesser");
  if (g) {
    g.textContent = `${Number(n).toLocaleString()}`;;
    styleRemaining(g, category);
  }
  // Setter sees category + animation
  const s = $("remainingWordsSetter");
  s.textContent = category;
  styleRemaining(s, category);
}
function computeRemainingAfterIndex(idx) {
  const words = window.ALLOWED_SECRETS;
  let count = 0;

  // Build a sliced history up to idx (inclusive)
  const partialHistory = state.history.slice(0, idx + 1);

  for (const w of words) {
    if (isConsistentWithHistory(partialHistory, w, state)) {
      count++;
    }
  }

  return count;
}
