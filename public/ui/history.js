window.renderHistory = function (state, container, isSetter) {
  container.innerHTML = "";

  const history = state?.history;
  if (!Array.isArray(history) || history.length === 0) {
    container.textContent = "No guesses yet.";
    return;
  }

  for (const entry of history) {
    if (!entry || !entry.guess) continue;

    const safeEntry = JSON.parse(JSON.stringify(entry));

    PowerEngine.applyHistoryEffects(safeEntry, isSetter);

    let fbArray;

// Prefer server-provided / power-modified arrays if available
if (!isSetter && Array.isArray(safeEntry.fbGuesser)) {
  fbArray = safeEntry.fbGuesser;
} else if (Array.isArray(safeEntry.fb)) {
  fbArray = safeEntry.fb;
} else {
  // Fallback: should never happen but avoids crashes
  fbArray = ["⬛","⬛","⬛","⬛","⬛"];
}


    if (!Array.isArray(fbArray) || fbArray.length < 5) {
      console.warn("Skipping invalid history entry:", safeEntry);
      continue;
    }

    const row = document.createElement("div");
    row.className = "history-row";

    const guess = safeEntry.guess.toUpperCase();

    let tiles = "";
    for (let i = 0; i < 5; i++) {
      tiles += fbArray[i];
    }

    // --------------------------------------------------------
    // CountOnly summary for BOTH players
    // --------------------------------------------------------
    if (safeEntry.extraInfo) {
      const { greens, yellows } = safeEntry.extraInfo;
      tiles += ` (${greens}🟩, ${yellows}🟨)`;
    }

    // --------------------------------------------------------
    // PowerUsed tag for BOTH players
    // --------------------------------------------------------
    if (safeEntry.powerUsed) {
      tiles += `   [${safeEntry.powerUsed}]`;
    }

    row.textContent = `${guess}   ${tiles}`;
    container.appendChild(row);
  }
};
