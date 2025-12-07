// /public/ui/history.js — MODULAR VERSION

window.renderHistory = function (state, container, isSetter) {
  container.innerHTML = "";

  if (!state?.history?.length) {
    container.textContent = "No guesses yet.";
    return;
  }

  for (const entry of state.history) {
    // Let power modules transform this entry if needed
    PowerEngine.applyHistory(entry, isSetter);

    const row = document.createElement("div");
    row.className = "history-row";

    const guess = entry.guess.toUpperCase();
    let tiles = "";

    const fbArray = isSetter ? entry.fb : entry.fbGuesser;

    for (let i = 0; i < 5; i++) {
      tiles += fbArray[i];
    }

    if (!isSetter && entry.extraInfo) {
      tiles += ` (${entry.extraInfo.greens}🟩, ${entry.extraInfo.yellows}🟨)`;
    }

    row.textContent = `${guess}   ${tiles}`;
    container.appendChild(row);
  }
};
