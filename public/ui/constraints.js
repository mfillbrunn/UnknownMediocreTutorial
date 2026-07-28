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
  // Total Blackout only ever blinds the guesser's own view (see
  // ui/history.js's buildHistoryRenderState for the matching fix) -- the
  // setter should keep seeing the constraint row normally throughout.
  // Actually clear the row (not just skip re-rendering it) so it reads as
  // genuinely blanked instead of showing whatever it last had.
  if (!isSetterView && state.powers?.blindGuessActive) {
    if (container.innerHTML !== "") container.innerHTML = "";
    container.__constraintSignature = null;
    return;
  }

  const grid = state.constraintData?.grid;
  if (!Array.isArray(grid) || grid.length !== 5) return;

  const bsIdx = state.powers?.blindSpotIndex;

  // This gets called on every keystroke (typing a guess/secret doesn't
  // change the constraints), but tearing the tiles down and recreating
  // them retriggers their entrance animation via the fresh DOM nodes.
  // Skip the rebuild entirely unless the actual constraint data changed.
  const signature = JSON.stringify({ grid, bsIdx, isSetterView });
  if (container.__constraintSignature === signature) return;

  // A position that just gained a green letter it didn't have before
  // (e.g. Magic Mode revealing a correct spot) gets a "flow up from the
  // bottom" flash so the reveal actually reads as new information instead
  // of silently appearing on the next re-render.
  const prevGrid = container.__prevGrid;
  const newlyGreen = new Set();
  for (let i = 0; i < 5; i++) {
    const wasGreen = prevGrid?.[i]?.green;
    const isGreen = grid[i]?.green;
    if (isGreen && !wasGreen) newlyGreen.add(i);
  }
  container.__prevGrid = grid;
  container.__constraintSignature = signature;

  container.innerHTML = "";

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

      const letter = document.createElement("span");
      letter.className = "main-letter";
      letter.textContent = cell.green;
      tile.appendChild(letter);

      if (newlyGreen.has(i)) {
        tile.classList.add("magic-reveal");
        tile.addEventListener(
          "animationend",
          () => tile.classList.remove("magic-reveal"),
          { once: true }
        );
      }

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
