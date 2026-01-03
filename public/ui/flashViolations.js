function findConsistencyViolations(history, proposedSecret, state) {
  const secret = (proposedSecret || "").toUpperCase();
  if (secret.length !== 5) {
    return { secretIndices: new Set(), history: [] };
  }

  const violations = {
    secretIndices: new Set(),   // indices in proposed secret to flash
    history: []                 // { roundIndex, indices: [...] }
  };

  const secretCounts = countLetters(secret);
  const secretHas = ch => secretCounts[ch] > 0;

  // --------------------------------------------------
  // 1) GREEN extra constraints (position-locked)
  // --------------------------------------------------
  if (state?.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN") {
        const idx = c.index;
        const locked = c.letter.toUpperCase();
        if (secret[idx] !== locked) {
          violations.secretIndices.add(idx);
        }
      }
    }
  }

  // --------------------------------------------------
  // 2) Walk through history rows
  // --------------------------------------------------
  history.forEach((entry, roundIndex) => {
    if (!entry || entry.ignoreConstraints || !entry.guess) return;

    const guess = entry.guess.toUpperCase();
    const rawFb = entry.fb ?? entry.fbGuesser;
    const fb = Array.isArray(rawFb) ? normalizeFB(rawFb) : null;
    if (!fb || fb.length !== 5) return;

    const badHistoryIndices = new Set();
    const claims = countClaims(guess, fb); // green+yellow per letter

    // ----------------------------------------------
    // A) SECRET-SIDE rules (flash X in secret)
    // ----------------------------------------------
    for (let i = 0; i < 5; i++) {
      const X = secret[i];
      const Y = guess[i];
      const f = fb[i];

      // Rule: green mismatch at same position
      if (f === "🟩" && X !== Y) {
        violations.secretIndices.add(i);
      }

      // Rule: yellow X in same position as X in secret
      if (f === "🟨" && X === Y) {
        violations.secretIndices.add(i);
      }
    }

    // Rule: black feedback anywhere for X,
    // BUT only if claims exhaust secret budget
    for (const letter in claims) {
      if (claims[letter] > secretCounts[letter]) {
        // mark ALL secret positions with this letter
        for (let i = 0; i < 5; i++) {
          if (secret[i] === letter) {
            violations.secretIndices.add(i);
          }
        }
      }
    }

    // ----------------------------------------------
    // B) HISTORY-SIDE rules (flash Y in history row)
    // ----------------------------------------------
    for (let i = 0; i < 5; i++) {
      const Y = guess[i];
      const X = secret[i];
      const f = fb[i];

      // Black Y but Y is in secret AND claims already used up
      if (f === "⬛") {
        if (secretHas(Y) && (claims[Y] || 0) >= secretCounts[Y]) {
          badHistoryIndices.add(i);
        }
      }

      // Green mismatch
      else if (f === "🟩") {
        if (X !== Y) badHistoryIndices.add(i);
      }

      // Yellow rules
      else if (f === "🟨") {
        // 1) Y not in secret
        if (!secretHas(Y)) badHistoryIndices.add(i);
        // 2) Y in secret but in same position
        else if (X === Y) badHistoryIndices.add(i);
      }
    }

    if (badHistoryIndices.size) {
      violations.history.push({
        roundIndex,
        indices: [...badHistoryIndices]
      });
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

function countLetters(word) {
  const map = {};
  for (const ch of word) {
    map[ch] = (map[ch] || 0) + 1;
  }
  return map;
}

function countClaims(guess, fb) {
  const claims = {};
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "🟩" || fb[i] === "🟨") {
      const ch = guess[i];
      claims[ch] = (claims[ch] || 0) + 1;
    }
  }
  return claims;
}


