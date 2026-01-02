// Suggest secret/guess
socket.on("suggestWord", ({ word }) => {
  const upper = word.toUpperCase();
  window.uiState = window.uiState || {};
  if (myRole === state.setter) {
    window.uiState.suggestedGuess = null;
    window.uiState.suggestedSecret = upper;
    state.setterDraft = upper;
  }
  if (myRole === state.guesser) {
    window.uiState.suggestedSecret = null;
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
  console.log("[CLIENT] RareLetterBonus reveal:", index, letter);

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



