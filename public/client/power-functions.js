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
// (Reveal Letter, Magic Mode, ...) fires this. The constraint row already
// flashes the tile itself; this adds a same-moment popup on BOTH screens
// so the reveal doesn't go unnoticed if you're not looking at the
// constraint row right then. Bet Power has its own richer result popup
// (betMissResult below) instead, since it also needs to report whether
// the bet itself was correct.
//--------------------------------------------------
const GREEN_REVEAL_SOURCE_LABELS = {
  revealLetter: "Reveal Letter",
  fieldReport: "Field Report",
  quest: "Quest",
  revealGreen: "Letter Peek"
};

socket.on("greenLetterRevealed", ({ index, letter, source }) => {
  // Quests are always-on for every guesser (not an opt-in activation like
  // the other sources here), and the AI actively steers its guessing
  // toward completing its own quest almost every round -- reusing the
  // same big center-screen "power used" splash for that made it feel
  // like the AI was constantly firing off a power it never actually has.
  // A quiet toast (still shown for both players, since the reveal is
  // real game state either way) is enough; the quest badge itself
  // already reflects completion.
  if (source === "quest") {
    // The guesser who earned it gets a short celebratory popup naming the
    // reward (letter, color, and position for a green); the setter gets
    // the same power-used-style popup other powers show their opponent,
    // not just a quiet toast, since a real green letter just got revealed
    // against their secret.
    const iAmGuesser = window.currentUser?.id && window.currentUser.id === window.state?.guesser;
    if (iAmGuesser) {
      window.showBigAnnounce?.({
        icon: "🟩",
        title: "Quest complete!",
        sub: `${letter.toUpperCase()} is green in position ${index + 1}.`,
        roleClass: "outcome-win",
        duration: 3200
      });
    } else {
      window.showPowerPopup?.({
        emoji: "🟩",
        title: "Opponent's quest complete!",
        desc: `${letter.toUpperCase()} is green in position ${index + 1}.`
      });
    }
    window.shake?.(document.querySelector(".quest-badge-tile"));
    // Same full-screen shake/flash every real power activation gets (see
    // client.js's onPowerUsed) -- quests never emit "powerUsed" (they're
    // always-on, not drafted/activated the same way), so without this a
    // completed quest was the one power-shaped moment in the game with no
    // shake at all. Green here, yellow for the early-claim trade below --
    // same treatment either way, just color-coded by which reward landed.
    window.triggerPowerFX?.("questGreen");
    return;
  }

  const label = GREEN_REVEAL_SOURCE_LABELS[source] || "A power";

  // Letter Peek's reveal isn't a real green tile -- the Spy can still
  // change their secret afterward, unlike every other source here (Reveal
  // Letter, Bet Power, Field Report, Quest), which permanently lock the
  // position in as known-green. Calling it "green" implies a permanence
  // it doesn't have, so it gets its own, more accurate wording.
  if (source === "revealGreen") {
    window.showBigAnnounce?.({
      icon: "👁️",
      title: "Letter revealed!",
      sub: `${label} revealed ${letter.toUpperCase()} in position ${index + 1}.`,
      roleClass: "outcome-win",
      duration: 4200
    });
    return;
  }

  window.showBigAnnounce?.({
    icon: "🟩",
    title: "Green letter revealed!",
    sub: `${label} revealed ${letter.toUpperCase()} in position ${index + 1}.`,
    roleClass: "outcome-win",
    duration: 4200
  });
});

//--------------------------------------------------
// BET POWER — reports whether the guesser's miss-count bet was correct,
// then (on a correct bet) the free green letter it earned, as two lines
// of the same popup so "predicted right" reads before "here's the
// reward" instead of the two facts competing for attention separately.
//--------------------------------------------------
socket.on("betMissResult", ({ correct, misses, betMissNumber, letter, index, noLetterLeft }) => {
  const missWord = misses === 1 ? "miss" : "misses";

  if (!correct) {
    window.showBigAnnounce?.({
      icon: "🎲",
      title: "Bet Power: wrong guess",
      sub: `You bet ${betMissNumber}, but the guess had ${misses} ${missWord}.`,
      duration: 4200
    });
    return;
  }

  const sub = [`Correctly predicted ${misses} ${missWord}!`];
  sub.push(
    noLetterLeft
      ? "No new letter left to reveal -- every position is already known."
      : `Gained a free green letter: ${letter.toUpperCase()} in position ${index + 1}.`
  );

  window.showBigAnnounce?.({
    icon: "🟩",
    title: "Bet Power: correct!",
    sub,
    roleClass: "outcome-win",
    duration: 4600
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
    sub: [sub, conditionList ? `Conditions: ${conditionList}` : null],
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

