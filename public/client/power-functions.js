//--------------------------------------------------
// UI BADGE
//--------------------------------------------------

function resetEphemeralUIState() {
  if (!window.uiState) return;

  delete window.uiState.suggestedGuess;
  delete window.uiState.suggestedSecret;
  delete window.uiState.vowelRefreshVowels;

  // future-safe: add more here as needed
}

// Suggest secret/guess
socket.on("suggestWord", ({ word }) => {
  if (!word) return;

  const upper = word.toUpperCase();
  window.uiState = window.uiState || {};

  if (myRole === "setter") {
    window.uiState.suggestedSecret = upper;
    state.setterDraft = upper;
  }

  if (myRole === "guesser") {
    window.uiState.suggestedGuess = upper;
    state.guesserDraft = upper;
    localGuesserDraft = upper;
  }

  updateUI();
});

// Vowel Refresh — UI-only info
socket.on("vowelRefreshInfo", ({ vowels }) => {
  window.uiState = window.uiState || {};
  window.uiState.vowelRefreshVowels = vowels; // e.g. ["A", "O"]
  updateUI();
});


//--------------------------------------------------
// RARE LETTER BONUS (client receives letter reveal)
//--------------------------------------------------
socket.on("rareLetterReveal", ({ index, letter }) => {
  // Ensure powers structure exists
  if (state && state.powers) {
    if (!state.powers.guesserLockedGreens) {
      state.powers.guesserLockedGreens = [];
    }
    state.powers.guesserLockedGreens.push(letter.toUpperCase());
  }

  // Update keyboard immediately
  try {
    if (typeof renderKeyboard === "function") {
      // rebuild both keyboards (setter/guesser)
      updateGuesserScreen?.();
      updateSetterScreen?.();
    }
  } catch (e) {
    console.warn("Keyboard refresh failed:", e);
  }

  // Optional: highlight current row
  highlightRareBonusTile(index, letter);
});

function highlightRareBonusTile(i, letter) {
  const row = document.querySelector(".board-row.current");
  if (!row) return;

  const tile = row.children[i];
  if (!tile) return;

  tile.textContent = letter.toUpperCase();
  tile.classList.add("tile-green", "power-reveal");
}

//--------------------------------------------------
// FREE GREEN LETTER — any power that grants a guaranteed green letter
// (Reveal Letter, Magic Mode, Bet Power, ...) fires this. The constraint
// row already flashes the tile itself; this adds a same-moment popup on
// BOTH screens so the reveal doesn't go unnoticed if you're not looking
// at the constraint row right then.
//--------------------------------------------------
const GREEN_REVEAL_SOURCE_LABELS = {
  revealLetter: "Reveal Letter",
  magicMode: "Magic Mode",
  betMiss: "Bet Power",
  fieldReport: "Field Report"
};

socket.on("greenLetterRevealed", ({ index, letter, source }) => {
  const label = GREEN_REVEAL_SOURCE_LABELS[source] || "A power";
  window.showBigAnnounce?.({
    icon: "🟩",
    title: "Green letter revealed!",
    sub: `${label} revealed ${letter.toUpperCase()} in position ${index + 1}.`,
    roleClass: "outcome-win",
    duration: 4200
  });
});

//--------------------------------------------------
// FIELD REPORT — always show how many of the 3 conditions the evaluated
// guess met, on both screens, right after it's scored (fires from the
// same onGuessSubmitted step that grants the reward, so the letter is
// already in extraConstraints by the time this popup appears).
//--------------------------------------------------
socket.on("fieldReportResult", ({ metCount, reward, letter, index, conditions }) => {
  const conditionList = Array.isArray(conditions)
    ? conditions.map(c => typeof formatFieldReportCondition === "function" ? formatFieldReportCondition(c) : c.type).join(" • ")
    : "";

  let icon = "📋";
  let title = `Field Report: ${metCount}/3 met`;
  let sub = "No reveal this time.";

  if (reward === "green") {
    icon = "🟩";
    title = `Field Report: 3/3 met!`;
    sub = `Revealed ${letter.toUpperCase()} in position ${index + 1}.`;
  } else if (reward === "yellow") {
    icon = "🟨";
    title = `Field Report: 2/3 met!`;
    sub = `${letter.toUpperCase()} is somewhere in the secret.`;
  } else if (reward === "none-left") {
    sub = "Everything was already known.";
  }

  window.showBigAnnounce?.({
    icon,
    title,
    sub: conditionList ? `${sub} (${conditionList})` : sub,
    roleClass: reward === "green" || reward === "yellow" ? "outcome-win" : "",
    duration: 6000
  });
});

//--------------------------------------------------
// FORCE GUESS
//--------------------------------------------------

function formatforceGuessOption(o) {
  switch (o.type) {
    case "startsWith":
      return `Starts with ${o.letter}`;
    case "endsWith":
      return `Ends with ${o.letter}`;
    case "doubleLetter":
      return `Double letter (${o.letter})`;
    case "minVowels":
      return "At least 3 vowels";
    case "maxVowels":
      return "At most 1 vowel";
    case "firstLastSame":
      return "First = Last";
    case "palindrome":
      return "Palindrome";
  }
}

function validateGuesserGuess(word, forceGuessOptions, allowedGuesses) {
  const g = word.toUpperCase();
  // No forced constraint → valid
  if (!forceGuessOptions || forceGuessOptions.length === 0) {
    return { ok: true, message: null };
  }

  // OR logic
  const satisfiesOne = forceGuessOptions.some(opt =>
    satisfiesforceGuess(g, opt)
  );

  if (satisfiesOne) {
    return { ok: true, message: null };
  }

  return {
    ok: false,
    message:
      "Guess must satisfy at least one forced condition"
  };
}

function satisfiesforceGuess(g, forceGuess) {
  switch (forceGuess.type) {
    case "startsWith":
      return g.startsWith(forceGuess.letter.toUpperCase());
    case "endsWith":
      return g.endsWith(forceGuess.letter.toUpperCase());
    case "doubleLetter":
      return g.includes(forceGuess.letter.toUpperCase().repeat(2));
    case "minVowels":
      return countVowels(g) >= forceGuess.count;
    case "maxVowels":
      return countVowels(g) <= forceGuess.count;
    case "firstLastSame":
      return g[0] === g[g.length - 1];
    case "palindrome":
      return isPalindrome(g);
    default:
      return false;
  }
}

function countVowels(word) {
  return [...word].filter(c => VOWELS.has(c.toUpperCase())).length;
}

function isPalindrome(word) {
  return word === word.split("").reverse().join("");
}

///ASSASSIN LISTENER
socket.on("assassinUsed", () => {
  updateUI();
});

socket.on("betMissUsed", () => {
  updateUI();
});

