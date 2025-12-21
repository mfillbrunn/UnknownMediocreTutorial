window.renderHistory = function ({
  state,
  container,
  role
}) {
  container.innerHTML = "";

  const isSetter = role === "setter";
  const history = state?.history || [];

  for (const entry of history) {
    if (!entry || !entry.guess) continue;

    const safeEntry = JSON.parse(JSON.stringify(entry));
    PowerEngine.applyHistoryEffects(safeEntry, isSetter);

    let fbArray;
    if (!isSetter && Array.isArray(safeEntry.fbGuesser)) {
      fbArray = safeEntry.fbGuesser;
    } else if (Array.isArray(safeEntry.fb)) {
      fbArray = safeEntry.fb;
    } else {
      fbArray = ["⬛", "⬛", "⬛", "⬛", "⬛"];
    }

    if (!Array.isArray(fbArray) || fbArray.length !== 5) continue;

    const row = document.createElement("div");
    row.className = "history-row";
    
    const guess = safeEntry.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      tile.textContent = guess[i];

      const fb = fbArray[i];
      if (fb === "🟩") tile.classList.add("tile-green");
      else if (fb === "🟨") tile.classList.add("tile-yellow");
      else if (fb === "🟦") tile.classList.add("tile-blue");
      else tile.classList.add("tile-gray");

      row.appendChild(tile);
    }

    if (safeEntry.extraInfo) {
      const { greens, yellows } = safeEntry.extraInfo;
      const extra = document.createElement("span");
      extra.className = "history-extra";
      extra.textContent = ` (${greens}🟩, ${yellows}🟨)`;
      row.appendChild(extra);
    }

    if (safeEntry.powerUsed) {
      const tag = document.createElement("span");
      tag.className = "history-power";
      tag.textContent = ` [${safeEntry.powerUsed}]`;
      row.appendChild(tag);
    }

    container.appendChild(row);
  }
};
