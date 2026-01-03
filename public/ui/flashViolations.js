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



function flashConsistencyViolations({ secretIndices, history }) {
  // --- Setter draft row tiles ---
  const draftRow = document.querySelector(".history-row.setter-draft");
  if (draftRow) {
    const draftTiles = draftRow.querySelectorAll(".history-tile");
    draftTiles.forEach((tile, i) => {
      if (secretIndices.has(i)) flashTile(tile);
    });
  }

  // --- History rows: setter + guesser ---
  const rowWraps = document.querySelectorAll(
    "#setterGuesserSubmitted .history-row-wrap, #historyGuesser .history-row-wrap"
  );

  history.forEach(({ roundIndex, indices }) => {
    const wrap = rowWraps[roundIndex];
    if (!wrap) return;

    const row = wrap.querySelector(".history-row");
    if (!row) return;

    const tiles = row.querySelectorAll(".history-tile");
    indices.forEach(i => {
      const tile = tiles[i];
      if (tile) flashTile(tile);
    });
  });
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
