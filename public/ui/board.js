/* ==========================================================
   Wordle-Style Tile Board System for Guesser
   ========================================================== */

const BOARD_ROWS = 6;
const BOARD_COLS = 5;

let boardState = [];
let activeRow = 0;
let activeCol = 0;

// The secret word (in lowercase) comes from client.js
window.currentSecret = null; 

/* ==========================================================
   Initialize the board (call when guesser screen becomes active)
   ========================================================== */
window.initBoard = function () {
  const board = document.getElementById("boardGuesser");
  board.innerHTML = "";

  boardState = Array.from({ length: BOARD_ROWS }, () => "");

  for (let r = 0; r < BOARD_ROWS; r++) {
    const row = document.createElement("div");
    row.className = "board-row";
    row.dataset.row = r;

    for (let c = 0; c < BOARD_COLS; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = r;
      tile.dataset.col = c;

      const inner = document.createElement("div");
      inner.className = "tile-inner";

      tile.appendChild(inner);
      row.appendChild(tile);
    }
    board.appendChild(row);
  }

  setActiveRow(0);
};

/* ==========================================================
   Set which row is active for typing
   ========================================================== */
function setActiveRow(rowIndex) {
  activeRow = rowIndex;
  activeCol = 0;
}

/* ==========================================================
   Add a typed letter
   ========================================================== */
window.addLetter = function (letter) {
  if (activeCol >= BOARD_COLS) return;
  boardState[activeRow] += letter;

  const tile = getTile(activeRow, activeCol);
  tile.querySelector(".tile-inner").textContent = letter.toUpperCase();

  activeCol++;

  applyPreviewColorsWhileTyping();
};

/* ==========================================================
   Remove last letter
   ========================================================== */
window.removeLetter = function () {
  if (activeCol === 0) return;

  activeCol--;
  boardState[activeRow] = boardState[activeRow].slice(0, -1);

  const tile = getTile(activeRow, activeCol);
  tile.querySelector(".tile-inner").textContent = "";
  tile.classList.remove("correct", "present", "absent"); // reset colors

  applyPreviewColorsWhileTyping();
};

/* ==========================================================
   Helper to get a tile
   ========================================================== */
function getTile(r, c) {
  return document.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

/* ==========================================================
   LIVE PREVIEW COLORING WHILE TYPING
   ========================================================== */
window.applyPreviewColorsWhileTyping = function () {
  const guess = boardState[activeRow];
  if (guess.length === 0) return;
  if (!window.currentSecret || window.currentSecret.length !== 5) return;

  // Only run preview when all letters typed
  if (guess.length < BOARD_COLS) return;

  // Get predicted feedback
  let previewResult = window.predictFeedback(window.currentSecret, guess);
  if (!previewResult) return;

  // Normalize feedback results
  previewResult = previewResult.map(p => {
    if (p === "correct" || p === "g" || p === "green") return "correct";
    if (p === "present" || p === "y" || p === "yellow") return "present";
    return "absent";
  });

  // Apply preview colors to tiles
  for (let c = 0; c < BOARD_COLS; c++) {
    const tile = getTile(activeRow, c);
    tile.classList.remove("correct", "present", "absent");
    tile.classList.add(previewResult[c]);
  }
};


/* ==========================================================
   Shake animation (invalid)
   ========================================================== */
window.shakeRow = function (rowIndex) {
  const row = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
  row.classList.add("tile-row-shake");
  setTimeout(() => row.classList.remove("tile-row-shake"), 300);
};

/* ==========================================================
   Final reveal animation (after submit)
   ========================================================== */
window.revealRowAnimation = function (rowIndex, feedback) {
  // normalize
  const mapped = feedback.map(p => {
    if (p === "correct" || p === "green" || p === "g") return "correct";
    if (p === "present" || p === "yellow" || p === "y") return "present";
    return "absent";
  });

  for (let c = 0; c < BOARD_COLS; c++) {
    const tile = getTile(rowIndex, c);

    setTimeout(() => {
      tile.classList.add("flip");

      setTimeout(() => {
        tile.classList.add(mapped[c]);
      }, 225);

    }, c * 150);
  }
};

/* ==========================================================
   Move to next row after a valid guess
   ========================================================== */
window.advanceRow = function () {
  if (activeRow < BOARD_ROWS - 1) {
    setActiveRow(activeRow + 1);
  }
};
