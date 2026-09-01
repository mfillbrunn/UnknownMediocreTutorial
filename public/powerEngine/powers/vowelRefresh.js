// /powers/powers/vowelRefresh.js
PowerEngine.register("vowelRefresh", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.vowelRefresh.label,
    desc: window.POWER_METADATA.vowelRefresh.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("vowelRefresh", window.POWER_METADATA.vowelRefresh.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);
    btn.onclick = () => {
      sendGameAction({ type: "USE_VOWEL_REFRESH" });
    };
  },

  // Previews exactly which vowels currently have real accumulated info
  // (from any past guess's feedback, or a power/reward-granted GREEN/
  // YELLOW/ABSENT constraint) -- matching vowelRefreshServer.js's apply(),
  // which always erases all 5 vowels across the WHOLE match history, not
  // just whichever vowel happened to appear in the most recent guess. This
  // used to check only the last guess (getRefreshableVowelIndices below),
  // which both blocked the button whenever the last guess had no vowel in
  // it -- even with plenty of vowel info sitting in earlier rows -- and
  // undersold the real effect ("This will reset: A") when it did apply.
  getActionPopup(state, role) {
    if (role !== "setter") return {};

    const known = vowelsWithKnowledge(state);
    if (known.size === 0) {
      return {
        desc: "No vowel clues have been revealed yet — this would have no effect.",
        useEnabled: false
      };
    }

    return {
      desc: `${window.POWER_METADATA.vowelRefresh.desc} This will reset: ${[...known].sort().join(", ")}.`
    };
  },
 uiEffects(state, role) {
    if (!this.buttonEl) return;

    // Hide if this power isn't active this match
    if (!state.activePowers.includes("vowelRefresh")) {
      this.buttonEl.style.display = "none";
      return;
    }

    // Show only to setter
    if (role !== "setter") {
      this.buttonEl.style.display = "none";
      return;
    }

    this.buttonEl.style.display = "";

    // Enable only when allowed
    const used = state.powers.vowelRefreshUsed;
    const turn = state.turn === state.setter;
    const phase = state.phase === "normal";

    this.buttonEl.disabled = used || !turn || !phase;
    this.buttonEl.classList.toggle("disabled-btn", this.buttonEl.disabled);

    // Preview: shine every vowel tile, in every row, that currently carries
    // real feedback -- the exact set vowelRefreshServer.js's apply() would
    // blank if the power were used right now (see vowelTileFlagsByRow
    // below). Used to only ever look at the last guess row; a vowel
    // confirmed several guesses back kept glittering-eligible in the data
    // but was never shown as such.
    const submittedContainer = $("setterGuesserSubmitted");
    const allTiles = submittedContainer?.querySelectorAll(".history-row .history-tile");

    if (allTiles?.length) {
      const flagsByRow = this.buttonEl.disabled ? [] : vowelTileFlagsByRow(state);
      const flatFlags = flagsByRow.flat();
      allTiles.forEach((tile, i) => {
        tile.classList.toggle("vowel-refresh-shine", !!flatFlags[i]);
      });
    }
  },
  historyEffects(entry, isSetter) {
  },

  keyboardEffects(state, role, keyEl, letter) {
  }
});

// Shared by getActionPopup/uiEffects above -- read-only, client-side
// mirrors of resetLetterKnowledge.js's hasLetterKnowledge/
// eraseLetterKnowledge on the server (same GREEN/YELLOW/ABSENT constraint
// types, same "a truthy fb or fbGuesser at that position counts" rule for
// history), scanning the WHOLE match rather than just the last guess --
// matching vowelRefreshServer.js's apply(), which always erases all 5
// vowels' entire history in one call.
const VOWEL_REFRESH_LETTERS = ["A", "E", "I", "O", "U"];

function vowelsWithKnowledge(state) {
  const found = new Set();

  for (const entry of state?.history || []) {
    const guess = String(entry?.guess || "").toUpperCase();
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      if (!VOWEL_REFRESH_LETTERS.includes(letter) || found.has(letter)) continue;
      if (
        (Array.isArray(entry.fb) && entry.fb[i]) ||
        (Array.isArray(entry.fbGuesser) && entry.fbGuesser[i])
      ) {
        found.add(letter);
      }
    }
  }

  for (const constraint of state?.extraConstraints || []) {
    const type = String(constraint?.type || "").toUpperCase();
    const letter = String(constraint?.letter || "").toUpperCase();
    if (
      ["GREEN", "YELLOW", "ABSENT"].includes(type) &&
      VOWEL_REFRESH_LETTERS.includes(letter)
    ) {
      found.add(letter);
    }
  }

  return found;
}

// One boolean array (5 slots) per history row: which tiles are a vowel
// with real feedback right now, in the same row order the DOM renders
// them -- exactly the tiles that go blank if Vowel Refresh is used.
function vowelTileFlagsByRow(state) {
  return (state?.history || []).map(entry => {
    const guess = String(entry?.guess || "").toUpperCase();
    return Array.from({ length: 5 }, (_, i) => {
      const letter = guess[i];
      if (!VOWEL_REFRESH_LETTERS.includes(letter)) return false;
      return !!(
        (Array.isArray(entry.fb) && entry.fb[i]) ||
        (Array.isArray(entry.fbGuesser) && entry.fbGuesser[i])
      );
    });
  });
}
// --------------------------------------------------
// Vowel Refresh — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const vowelsActive = state.powers.vowelRefreshActive;
  if (!vowelsActive) return null;


  const vowels = window.uiState?.vowelRefreshVowels;
  if (!Array.isArray(vowels) || vowels.length === 0) {
    return {
      id: "vowelRefresh-used",
      emoji: POWER_METADATA.vowelRefresh.emoji,
      text: `${POWER_METADATA.vowelRefresh.label} used but to no effect`,
      color: POWER_METADATA.vowelRefresh.color,
      priority: 30,
      screen: "both",
      details: POWER_METADATA.vowelRefresh.desc
    };
  }

  return {
    id: "vowelRefresh-detail",
    emoji: POWER_METADATA.vowelRefresh.emoji,
    text: `${POWER_METADATA.vowelRefresh.label}: ${vowels.join(", ")}`,
    color: POWER_METADATA.vowelRefresh.color,
    priority: 30,
    screen: "both",
    details: `Reset vowels: ${vowels.join(", ")}`
  };
});
