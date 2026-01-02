//--------------------------------------------------
// UI BADGE
//--------------------------------------------------

function resetEphemeralUIState() {
  if (!window.uiState) return;

  //delete window.uiState.suggestedGuess;
  //delete window.uiState.suggestedSecret;
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

function validateGuesserGuess(word, forcedGuess, allowedGuesses) {
  if (!word || word.length !== 5) {
    return { ok: false, message: "Guess must be 5 letters" };
  }

  const g = word.toLowerCase();
  // Dictionary check
  if (!allowedGuesses.has(g)) {
    return { ok: false, message: "Word not in dictionary" };
  }
  // No forced constraint → valid
  if (!forcedGuess) {
    return { ok: true, message: null };
  }
  let ok = true;
  let msg = "";
  switch (forcedGuess.type) {
    case "containsTwo":
      ok = forcedGuess.letters.every(l =>
        g.includes(l.toLowerCase())
      );
      msg = `Must contain ${forcedGuess.letters.join(" + ")}`;
      break;

    case "startsWith":
      ok = g.startsWith(forcedGuess.letter.toLowerCase());
      msg = `Must start with ${forcedGuess.letter}`;
      break;
    case "endsWith":
      ok = g.endsWith(forcedGuess.letter.toLowerCase());
      msg = `Must end with ${forcedGuess.letter}`;
      break;
    case "doubleLetter":
      ok = hasDoubleLetter(g);
      msg = "Must contain a double letter";
      break;
    case "minVowels":
      ok = countVowels(g) >= forcedGuess.count;
      msg = `Must contain at least ${forcedGuess.count} vowels`;
      break;
    case "maxVowels":
      ok = countVowels(g) <= forcedGuess.count;
      msg = `Must contain at most ${forcedGuess.count} vowels`;
      break;
    case "firstLastSame":
      ok = g[0] === g[g.length - 1];
      msg = "First and last letter must match";
      break;
    case "palindrome":
      ok = isPalindrome(g);
      msg = "Must be a palindrome";
      break;
    default:
      // Unknown constraint → fail safe
      return { ok: false, message: "Invalid forced guess rule" };
  }

  return ok
    ? { ok: true, message: null }
    : { ok: false, message: msg };
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
