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
  const draftRow = document.querySelector(
    ".history-row.setter-draft"
  );
  if (draftRow) {
    [...draftRow.children].forEach((tile, i) => {
      if (secretIndices.has(i)) {
        tile.classList.add("violation");
        tile.addEventListener(
          "animationend",
          () => tile.classList.remove("violation"),
          { once: true }
        );
      }
    });
  }

  // --- History rows ---
  history.forEach(({ roundIndex, indices }) => {
    const rows = document.querySelectorAll(
      "#historyGuesser .history-row, #historySetter .history-row"
    );
    const row = rows[roundIndex];
    if (!row) return;

    indices.forEach(i => {
      const tile = row.children[i];
      if (!tile) return;

      tile.classList.add("violation");
      tile.addEventListener(
        "animationend",
        () => tile.classList.remove("violation"),
        { once: true }
      );
    });
  });
}

