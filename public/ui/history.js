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

   const rowWrap = document.createElement("div");
    rowWrap.className = "history-row-wrap";
    
    const row = document.createElement("div");
    row.className = "history-row";

    if (safeEntry.extraInfo) {
      row.classList.add("evaluated-row");
    }
    const guess = safeEntry.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      tile.textContent = guess[i];
      
      const fb = fbArray[i];
      const isHiddenCycling =
      !isSetter &&
      Array.isArray(safeEntry.hiddenIndices) &&
      safeEntry.hiddenIndices.includes(i);

      if (isHiddenCycling) {
        tile.classList.add("tile-hidden-cycle");
      } else {
        if (fb === "🟩") tile.classList.add("tile-green");
        else if (fb === "🟨") tile.classList.add("tile-yellow");
        else if (fb === "🟦") tile.classList.add("tile-blue");
        else tile.classList.add("tile-gray");
      }
      row.appendChild(tile);
    }
    const meta = document.createElement("div");
      meta.className = "history-meta";
      
      if (safeEntry.powerUsed) {
        meta.textContent = safeEntry.powerUsed;
      }

    if (safeEntry.extraInfo) {
      const { greens, yellows } = safeEntry.extraInfo;
      const extra = document.createElement("span");
      extra.className = "history-extra";
      extra.textContent = ` (${greens}🟩, ${yellows}🟨)`;
      row.appendChild(extra);
    }
    rowWrap.appendChild(row);
    rowWrap.appendChild(meta);
    container.appendChild(row);
  }
};
