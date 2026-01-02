window.renderHistory = function ({
  state,
  container,
  role
}) {
  if (state.powers?.blindGuessActive) {return;}
  container.innerHTML = "";
  const isSetter = role === "setter";
  const bsIdx   = state?.powers?.blindSpotIndex;
  const bsRound = state?.powers?.blindSpotRoundIndex;
  const history = state?.history || [];
  let j=-1;
  for (const entry of history) {
    if (!entry || !entry.guess) continue;
    j = j + 1;
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

    const meta = document.createElement("div");
      meta.className = "history-meta";

    if (safeEntry.extraInfo) {
      row.classList.add("evaluated-row");
    }
    const guess = safeEntry.guess.toUpperCase();

    for (let i = 0; i < 5; i++) {
      const tile = document.createElement("div");
      tile.className = "history-tile";

      tile.textContent = guess[i];
      
      const fb = fbArray[i];
      const isBlindSpot =
        !isSetter &&
        typeof bsIdx === "number" &&
        typeof bsRound === "number" &&
        i === bsIdx &&
        entry.roundIndex >= bsRound;
      
      if (isBlindSpot) {
        tile.classList.add("tile-purple");
        tile.textContent = "?"; // or keep guess[i] if you prefer
      }
      else {
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
      }
          
      if ( !isSetter && state.powers.countOnlyUsed && j ===  state.powers.countOnlyRound) {
        tile.classList.add("tile-hidden-cycle");  // THIS SHOULD APPLY ONLY TO LAST ONE OF HISTORY
      }
      row.appendChild(tile);
    }
    
    if (safeEntry.extraInfo) {
      const { greens, yellows } = safeEntry.extraInfo;
      meta.textContent = `${greens}🟩 ${yellows}🟨`;
      meta.classList.add("history-meta-count");
    }
    const rowAnchor = document.createElement("div");
    rowAnchor.className = "history-row-anchor";
    rowAnchor.appendChild(row);
    rowAnchor.appendChild(meta);
    rowWrap.appendChild(rowAnchor);
    container.appendChild(rowWrap);
  }
};
