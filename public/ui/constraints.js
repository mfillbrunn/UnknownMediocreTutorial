window.formatPattern = function (pattern) {
  if (Array.isArray(pattern)) {
    return pattern.join(" ");
  }
  if (typeof pattern === "string") {
    return pattern.split("").join(" ");
  }
  return "";
};

window.renderConstraintRow = function ({
  state,
  container,
  isSetterView
}) {
  if (state.powers?.blindGuessActive) return;

  container.innerHTML = "";

  const grid = state.constraintData?.grid;
  if (!Array.isArray(grid) || grid.length !== 5) return;

  const bsIdx = state.powers?.blindSpotIndex;

  for (let i = 0; i < 5; i++) {
    const tile = document.createElement("div");
    tile.className = "history-tile constraint-tile";

    const cell = grid[i] || { green: null, forbidden: [] };

    if (typeof bsIdx === "number" && i === bsIdx) {
      tile.classList.add("tile-blindspot");

      if (!isSetterView) {
        tile.textContent = "";
        container.appendChild(tile);
        continue;
      }
    }

    if (cell.green) {
      tile.classList.add("tile-green");
      tile.textContent = cell.green;
      container.appendChild(tile);
      continue;
    }

    const letters = Array.isArray(cell.forbidden)
      ? cell.forbidden.slice(0, 4)
      : [];

    for (const letter of letters) {
      const span = document.createElement("span");
      span.className = "constraint-letter forbidden";
      span.textContent = letter;
      tile.appendChild(span);
    }

    if (letters.length === 0) {
      tile.classList.add("tile-gray");
    }

    container.appendChild(tile);
  }
};
