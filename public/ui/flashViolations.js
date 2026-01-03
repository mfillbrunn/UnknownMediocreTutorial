function findConsistencyViolations(history, proposedSecret, state) {
  proposedSecret = proposedSecret.toUpperCase();

  const violations = {
    secretIndices: new Set(),      // indices in new secret
    history: []                    // { roundIndex, indices }
  };

  // Extra constraints (GREEN locks, etc.)
  if (state?.extraConstraints?.length) {
    for (const c of state.extraConstraints) {
      if (c.type === "GREEN" && proposedSecret[c.index] !== c.letter) {
        violations.secretIndices.add(c.index);
      }
    }
  }

  history.forEach((entry, roundIndex) => {
    if (entry.ignoreConstraints) return;

    const guess = entry.guess.toUpperCase();
    const rawFb = entry.fb ?? entry.fbGuesser;
    const actual = normalizeFB(rawFb);
    const expected = window.scoreGuess(proposedSecret, guess);

    const bad = [];

    for (let i = 0; i < 5; i++) {
      if (actual[i] !== "" && expected[i] !== actual[i]) {
        violations.secretIndices.add(i);
        bad.push(i);
      }
    }

    if (bad.length) {
      violations.history.push({ roundIndex, indices: bad });
    }
  });

  return violations;
}

function flashConsistencyViolations({ secretIndices, history }) {
  // --- Setter draft ---
  const draftRow = document.querySelector(".history-row.setter-draft");
  if (draftRow) {
    const tiles = draftRow.querySelectorAll(".history-tile");
    tiles.forEach((tile, i) => {
      if (secretIndices.has(i)) {
        flashTile(tile);
      }
    });
  }

  // --- History rows ---
  const rowWraps = document.querySelectorAll(
    "#historySetter .history-row-wrap, #historyGuesser .history-row-wrap"
  );

  history.forEach(({ roundIndex, indices }) => {
    const wrap = rowWraps[roundIndex];
    if (!wrap) return;

    const row = wrap.querySelector(".history-row");
    if (!row) return;

    const tiles = row.querySelectorAll(".history-tile");

    indices.forEach(i => {
      const tile = tiles[i];
      if (tile) {
        flashTile(tile);
      }
    });
  });
}

function flashTile(tile) {
  tile.classList.add("violation");
  tile.addEventListener(
    "animationend",
    () => tile.classList.remove("violation"),
    { once: true }
  );
}


