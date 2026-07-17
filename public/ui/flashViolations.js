function findConsistencyViolations(history, proposedSecret) {
  const secret = (proposedSecret || "").toUpperCase();

  const violations = {
    secretIndices: new Set()
  };

  if (secret.length !== 5) return violations;

  history.forEach(entry => {
    if (!entry || entry.ignoreConstraints || !entry.guess) return;

    const guess = entry.guess.toUpperCase();
    const rawFb = entry.fb ?? entry.fbGuesser;
    const fb = Array.isArray(rawFb) ? normalizeFB(rawFb) : null;
    if (!fb || fb.length !== 5) return;

    // Precompute where X appears yellow or black in this guess
    const yellowLetters = new Set();
    const blackLetters = new Set();

    for (let j = 0; j < 5; j++) {
      if (fb[j] === "🟨") yellowLetters.add(guess[j]);
      if (fb[j] === "⬛") blackLetters.add(guess[j]);
    }

    // Check each secret position X
    for (let i = 0; i < 5; i++) {
      const X = secret[i];
      const Y = guess[i];
      const f = fb[i];

      // Rule 1: same position, green → OK
      if (Y === X && f === "🟩") {
        continue;
      }

      // Rule 2: same letter, yellow or black → flash X
      if (Y === X && (f === "🟨" || f === "⬛")) {
        violations.secretIndices.add(i);
        continue;
      }

      // Rule 3: different letter, green at this position → flash X
      if (Y !== X && f === "🟩") {
        violations.secretIndices.add(i);
        continue;
      }

      // Rule 4: black elsewhere AND no yellow anywhere → flash X
      if (blackLetters.has(X) && !yellowLetters.has(X)) {
        violations.secretIndices.add(i);
        continue;
      }

      // Otherwise → do nothing
    }
  });

  return violations;
}



// Explains, in plain language, exactly why a drafted secret contradicts the
// feedback given so far (and any extraConstraints from powers) — so the
// setter's popup can say *what's* wrong instead of just "not consistent".
// Mirrors the same rules server/game-engine/history.js's
// isConsistentWithHistory enforces, just surfaced as readable reasons.
function explainSecretInconsistency(history, extraConstraints, proposedSecret) {
  const secret = (proposedSecret || "").toUpperCase();
  if (secret.length !== 5) return [];

  const entries = (history || []).filter(e => e && !e.ignoreConstraints && e.guess);

  // Known green letters per position, from history + any GREEN extraConstraints.
  const greenPattern = Array(5).fill(null);
  entries.forEach(entry => {
    const guess = entry.guess.toUpperCase();
    const fb = normalizeFB(entry.fb ?? entry.fbGuesser ?? []);
    if (!fb) return;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩") greenPattern[i] = guess[i];
    }
  });
  (extraConstraints || []).forEach(c => {
    if (c.type === "GREEN") greenPattern[c.index] = c.letter;
  });

  // Letters confirmed to be in the secret somewhere (green or yellow, ever).
  const mustContain = new Set();
  entries.forEach(entry => {
    const guess = entry.guess.toUpperCase();
    const fb = normalizeFB(entry.fb ?? entry.fbGuesser ?? []);
    if (!fb) return;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟩" || fb[i] === "🟨") mustContain.add(guess[i]);
    }
  });
  (extraConstraints || []).forEach(c => {
    if (c.type === "GREEN" || c.type === "YELLOW") mustContain.add(c.letter);
  });

  const secretLetters = secret.split("");
  const secretLetterSet = new Set(secretLetters);
  const reasons = [];

  // 1) Wrong letter at a position already confirmed green.
  for (let i = 0; i < 5; i++) {
    if (greenPattern[i] && secretLetters[i] !== greenPattern[i]) {
      reasons.push(`Position ${i + 1} must be ${greenPattern[i]} (you have ${secretLetters[i] || "_"})`);
    }
  }

  // 2) Missing a letter already confirmed present in the secret. Letters
  //    pinned to a specific position (greenPattern) are excluded here —
  //    when one of those is missing entirely, rule 1 above already reports
  //    it (with the more useful position detail), so this only covers
  //    yellow-confirmed letters that could go anywhere.
  const missing = [...mustContain].filter(
    l => !secretLetterSet.has(l) && !greenPattern.includes(l)
  );
  if (missing.length) {
    reasons.push(`Missing letter${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  }

  // 3) A yellow letter placed right back at the position it was ruled out of.
  entries.forEach(entry => {
    const guess = entry.guess.toUpperCase();
    const fb = normalizeFB(entry.fb ?? entry.fbGuesser ?? []);
    if (!fb) return;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "🟨" && secretLetters[i] === guess[i]) {
        reasons.push(`${guess[i]} can't be at position ${i + 1} (already tried there)`);
      }
    }
  });

  // 4) A letter the draft includes that a guess proved absent from the
  //    secret entirely (marked black, never confirmed present elsewhere).
  const excluded = new Set();
  entries.forEach(entry => {
    const guess = entry.guess.toUpperCase();
    const fb = normalizeFB(entry.fb ?? entry.fbGuesser ?? []);
    if (!fb) return;
    for (let i = 0; i < 5; i++) {
      if (fb[i] === "⬛" && !mustContain.has(guess[i])) {
        excluded.add(guess[i]);
      }
    }
  });
  const wronglyIncluded = [...excluded].filter(l => secretLetterSet.has(l));
  if (wronglyIncluded.length) {
    reasons.push(`${wronglyIncluded.join(", ")} shouldn't be in the word (already ruled out)`);
  }

  return [...new Set(reasons)];
}

function flashConsistencyViolations(secretIndices) {
  // --- Setter draft row tiles ---
  const draftRow = document.querySelector(".history-row.setter-draft");
  if (draftRow) {
    const draftTiles = draftRow.querySelectorAll(".history-tile");
    draftTiles.forEach((tile, i) => {
      if (secretIndices.has(i)) flashTile(tile);
    });
  } 
}

function flashTile(tile) {
  // restart animation reliably even if it was just applied
  tile.classList.remove("violation");
  void tile.offsetWidth; // force reflow
  tile.classList.add("violation");

  tile.addEventListener(
    "animationend",
    () => tile.classList.remove("violation"),
    { once: true }
  );
}
