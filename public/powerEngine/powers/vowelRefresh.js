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

  // Previews exactly which vowels would actually get reset, using the same
  // eligibility rule the server enforces (a vowel in the last guess not
  // already confirmed present by an earlier guess) -- and refuses to let
  // the setter burn the power for nothing when there's nothing eligible.
  getActionPopup(state, role) {
    if (role !== "setter") return {};

    const eligible = getRefreshableVowelIndices(state);
    if (eligible.size === 0) {
      return {
        desc: "No vowels to reset — the last guess has no unconfirmed vowels right now.",
        useEnabled: false
      };
    }

    const guess = state.history?.[state.history.length - 1]?.guess?.toUpperCase() || "";
    const letters = [...new Set([...eligible].map(i => guess[i]))];
    return {
      desc: `${window.POWER_METADATA.vowelRefresh.desc} This will reset: ${letters.join(", ")}.`
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

    // Preview: shine whichever vowels in the LAST guess would actually get
    // reset if the power were used right now, so the setter can judge
    // whether it's worth spending before committing -- same eligibility
    // rule the server enforces (vowelRefreshServer.js): a vowel in the
    // last guess not already confirmed present by an earlier guess.
    //
    // A guess earlier in the match was once "the last row" and got shined
    // then -- once a newer guess comes in it's no longer the last row, but
    // nothing else ever revisits it to turn the class back off, so it kept
    // glittering forever. Clear it off every row before reapplying it to
    // only the current last one.
    const submittedContainer = $("setterGuesserSubmitted");
    submittedContainer?.querySelectorAll(".vowel-refresh-shine")
      .forEach(tile => tile.classList.remove("vowel-refresh-shine"));

    const lastRow = submittedContainer?.lastElementChild;
    const tiles = lastRow?.querySelectorAll(".history-tile");
    if (tiles?.length === 5) {
      const eligible = this.buttonEl.disabled ? new Set() : getRefreshableVowelIndices(state);
      tiles.forEach((tile, i) => {
        tile.classList.toggle("vowel-refresh-shine", eligible.has(i));
      });
    }
  },
  historyEffects(entry, isSetter) {
  },

  keyboardEffects(state, role, keyEl, letter) {
  }
});

// Shared by uiEffects above -- mirrors vowelRefreshServer.js's apply()
// exactly (same "known present before this round" exclusion), just
// read-only and index-based instead of mutating feedback.
function getRefreshableVowelIndices(state) {
  const history = state.history || [];
  const lastIndex = history.length - 1;
  const entry = history[lastIndex];
  if (!entry?.guess) return new Set();

  const vowels = new Set(["A", "E", "I", "O", "U"]);
  const guess = entry.guess.toUpperCase();
  const knownPresent = new Set();

  for (let r = 0; r < lastIndex; r++) {
    const h = history[r];
    const fb = h.fb ?? h.fbGuesser;
    if (!Array.isArray(fb)) continue;
    const g = h.guess.toUpperCase();
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩" || fb[i] === "🟨") knownPresent.add(g[i]);
    }
  }

  const indices = new Set();
  for (let i = 0; i < 5; i++) {
    const letter = guess[i];
    if (!vowels.has(letter)) continue;
    if (knownPresent.has(letter)) continue;
    indices.add(i);
  }
  return indices;
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
