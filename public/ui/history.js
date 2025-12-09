window.renderHistory = function (state, container, isSetter) {
  container.innerHTML = "";

  // Ensure history exists and is an array
  const history = state?.history;
  if (!Array.isArray(history) || history.length === 0) {
    container.textContent = "No guesses yet.";
    return;
  }

  for (const entry of history) {
    // Skip broken / incomplete entries
    if (!entry || !entry.guess) continue;

    // Setter sees actual fb; guesser sees fbGuesser
    const fbArray = isSetter ? entry.fb : entry.fbGuesser;

    // fbArray must be a valid array of length 5 to render it
    if (!Array.isArray(fbArray) || fbArray.length < 5) {
      console.warn("Skipping invalid history entry:", entry);
      continue;
    }

    // Allow powers to modify entry before displaying
    PowerEngine.applyHistoryEffects(entry, isSetter);

    const row = document.createElement("div");
    row.className = "history-row";

    const guess = entry.guess.toUpperCase();

    let tiles = "";
    for (let i = 0; i < 5; i++) {
      tiles += fbArray[i];
    }

    // Show extra info only to guesser
    if (!isSetter && entry.extraInfo) {
      const { greens, yellows } = entry.extraInfo;
      tiles += ` (${greens}🟩, ${yellows}🟨)`;
    }

    row.textContent = `${guess}   ${tiles}`;
    container.appendChild(row);
  }
};
