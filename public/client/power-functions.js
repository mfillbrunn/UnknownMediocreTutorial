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
  const upper = word.toUpperCase();
  window.uiState = window.uiState || {};
  if (myRole === state.setter) {
    window.uiState.suggestedSecret = upper;
    state.setterDraft = upper;
  }
  if (myRole === state.guesser) {
    window.uiState.suggestedGuess = upper;
    localGuesserDraft = upper.toLowerCase();
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
// FORCE GUESS
//--------------------------------------------------

function formatForceGuessOption(o) {
  switch (o.type) {
    case "containsTwo":
      return `Contains ${o.letters.join(" + ")}`;
    case "startsWith":
      return `Starts with ${o.letter}`;
    case "endsWith":
      return `Ends with ${o.letter}`;
    case "doubleLetter":
      return "Double letter";
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
  const g = word.toLowerCase();
  // No forced constraint → valid
  if (!forceGuessOptions || forceGuessOptions.length === 0) {
    return { ok: true, message: null };
  }

  // OR logic
  const satisfiesOne = forceGuessOptions.some(opt =>
    satisfiesForceGuess(g, opt)
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

function satisfiesForceGuess(g, forceGuess) {
  switch (forceGuess.type) {
    case "startsWith":
      return g.startsWith(forceGuess.letter.toLowerCase());
    case "endsWith":
      return g.endsWith(forceGuess.letter.toLowerCase());
    case "doubleLetter":
      return hasDoubleLetter(g);
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

function hasDoubleLetter(word) {
  return /(.)\1/.test(word);
}

///ASSASSIN LISTENER
socket.on("assassinUsed", () => {
  updateUI();
});
