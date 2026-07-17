// /powers/powers/revealLetter.js

// Mirrors the unlock thresholds in server/powers/powers/revealLetterServer.js
// turnStart() — kept in sync manually since the server is the source of
// truth for when the power actually unlocks; this only computes a
// human-readable progress readout from the same public history data.
const RARE_LETTERS = "QJXZWKV".split("");
const RARE_NEEDED = 4;
const KEYBOARD_ROWS = [
  { name: "Top row (QWERTYUIOP)", letters: "QWERTYUIOP".split("") },
  { name: "Home row (ASDFGHJKL)", letters: "ASDFGHJKL".split("") },
  { name: "Bottom row (ZXCVBNM)", letters: "ZXCVBNM".split("") }
];
const CHAIN_ALPHA_DOUBLES_NEEDED = 3;

function isAscendingWord(word) {
  for (let i = 1; i < word.length; i++) {
    if (word.charCodeAt(i) <= word.charCodeAt(i - 1)) return false;
  }
  return true;
}

function doubledLetterOf(word) {
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) return word[i];
  }
  return null;
}

function computeRevealLetterStatus(state) {
  const p = state.powers?.revealLetter;
  if (!p || !p.mode) return null;

  if (p.used) {
    return { label: "Used", desc: "Already revealed a letter this match." };
  }
  if (p.ready) {
    return { label: "Ready!", desc: "Click to reveal a guaranteed green letter." };
  }

  const history = state.history || [];

  if (p.mode === "RARE") {
    const seen = new Set();
    for (const h of history) {
      for (const c of (h.guess || "").toUpperCase()) {
        if (RARE_LETTERS.includes(c)) seen.add(c);
      }
    }
    const found = Array.from(seen).sort();
    return {
      label: `${found.length}/${RARE_NEEDED}`,
      desc: `Use ${RARE_NEEDED}+ rare letters (${RARE_LETTERS.join(", ")}) across your guesses. ` +
        (found.length ? `Found so far: ${found.join(", ")}.` : "None found yet.")
    };
  }

  if (p.mode === "ROW") {
    const used = KEYBOARD_ROWS.map(() => new Set());
    for (const h of history) {
      for (const c of (h.guess || "").toUpperCase()) {
        KEYBOARD_ROWS.forEach((row, i) => {
          if (row.letters.includes(c)) used[i].add(c);
        });
      }
    }
    let bestIdx = 0;
    KEYBOARD_ROWS.forEach((row, i) => {
      if (used[i].size / row.letters.length > used[bestIdx].size / KEYBOARD_ROWS[bestIdx].letters.length) {
        bestIdx = i;
      }
    });
    const row = KEYBOARD_ROWS[bestIdx];
    return {
      label: `${used[bestIdx].size}/${row.letters.length}`,
      desc: `Use every letter in one keyboard row. Closest: ${row.name} — ${used[bestIdx].size}/${row.letters.length} used.`
    };
  }

  if (p.mode === "ALPHA") {
    const count = history.filter(h => isAscendingWord((h.guess || "").toUpperCase())).length;
    return {
      label: `${count}/${CHAIN_ALPHA_DOUBLES_NEEDED}`,
      desc: `Submit ${CHAIN_ALPHA_DOUBLES_NEEDED} guesses with letters in alphabetical order (e.g. ABHOR). Found so far: ${count}.`
    };
  }

  if (p.mode === "DOUBLES") {
    const doubles = new Set();
    for (const h of history) {
      const d = doubledLetterOf((h.guess || "").toUpperCase());
      if (d) doubles.add(d);
    }
    const found = Array.from(doubles).sort();
    return {
      label: `${found.length}/${CHAIN_ALPHA_DOUBLES_NEEDED}`,
      desc: `Submit ${CHAIN_ALPHA_DOUBLES_NEEDED} guesses with distinct double letters. ` +
        (found.length ? `Found so far: ${found.join(", ")}.` : "None found yet.")
    };
  }

  // CHAIN
  let links = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = (history[i - 1].guess || "").toUpperCase();
    const curr = (history[i].guess || "").toUpperCase();
    if (curr[0] === prev[4]) links++;
  }
  return {
    label: `${links}/${CHAIN_ALPHA_DOUBLES_NEEDED}`,
    desc: `Submit ${CHAIN_ALPHA_DOUBLES_NEEDED} guesses that each start with the last letter of your previous guess. Linked so far: ${links}.`
  };
}

PowerEngine.register("revealLetter", {
  role: "guesser",

  renderButton(roomId) {
    const { wrapper, btn } =
    PowerEngine.createPowerButton("revealLetter", "Reveal Letter");

  this.wrapperEl = wrapper;
  this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      // Normalized by powerEngineServer.normalizePowerId → "revealLetter"
      sendGameAction({ type: "USE_REVEAL_LETTER" });
    };

// Tooltip hooks (variant-aware, with live progress)
    const showVariantTooltip = () => {
      const mode = window.state?.powers?.revealLetter?.mode;
      const meta =
        window.POWER_METADATA?.revealLetter?.variants?.[mode];

      if (!meta) return;

      const status = window.state ? computeRevealLetterStatus(window.state) : null;

      showTooltip(btn, {
        title: meta.label,
        desc: status ? `${meta.desc} ${status.desc}` : meta.desc
      });
    };

    btn.addEventListener("mouseenter", showVariantTooltip);
    btn.addEventListener("focus", showVariantTooltip);
    btn.addEventListener("mouseleave", hideTooltip);
    btn.addEventListener("blur", hideTooltip);
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;

    // Hide if this power is not active this match
    if (!state.activePowers || !state.activePowers.includes("revealLetter")) {
      btn.style.display = "none";
      return;
    }

    // Only guesser sees the button
    if (role !== "guesser") {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";

    // Button label: condition name + a compact live-progress suffix.
    const mode = state.powers?.revealLetter?.mode;
    const conditionName =
      mode === "RARE" ? "High-Value Target" :
      mode === "ROW" ? "Full Sweep" :
      mode === "ALPHA" ? "In Order" :
      mode === "DOUBLES" ? "Double Trouble" :
      mode === "CHAIN" ? "Word Chain" :
      "Confirmed Lead";

    const status = computeRevealLetterStatus(state);
    btn.textContent = status ? `${conditionName} (${status.label})` : conditionName;
  }
});

// --------------------------------------------------
// Reveal Letter — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.revealLetter;
  if (!state.powers?.revealLetterActive) return null;
  const greens = state.extraConstraints?.filter(
    c => c.type === "GREEN" && typeof c.index === "number"
  );

  if (!greens || greens.length === 0) return null;
   const last = greens[greens.length - 1];
  return {
    id: "revealLetter",
    emoji: meta.emoji ?? "🟩",
    text: `${meta.label}: position ${last.index + 1} = ${last.letter}`,
    color: meta.color,
    priority: 12,
    screen: "both",
    details: meta.desc
  };
});

