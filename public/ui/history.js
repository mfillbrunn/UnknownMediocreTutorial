// /public/ui/history.js

/**
 * Render guess history.
 *
 * Setter sees:
 *   GUESS   true fb (🟩🟨⬛)
 *
 * Guesser sees:
 *   GUESS   fbGuesser (with ❓ for hidden) + optional "Feedback: X green, Y yellow"
 *
 * @param {Object} state - full game state
 * @param {HTMLElement} container - history DOM element
 * @param {boolean} isSetter - true for setter view, false for guesser view
 */
export function renderHistory(state, container, isSetter) {
  container.innerHTML = "";

  if (!state || !state.history || !state.history.length) {
    container.textContent = "No guesses yet.";
    return;
  }

  for (const h of state.history) {
    const div = document.createElement("div");
    div.style.marginBottom = "6px";

    const guess = h.guess.toUpperCase();

    let tiles = "";
    if (isSetter) {
      // Setter sees true feedback
      for (const f of h.fb) tiles += f;
    } else {
      // Guesser sees transformed feedback
      for (let i = 0; i < 5; i++) {
        if (h.hiddenIndices.includes(i)) {
          tiles += "❓";
        } else {
          tiles += h.fbGuesser[i];
        }
      }
      if (h.extraInfo) {
        tiles += `   Feedback: ${h.extraInfo.greens} green, ${h.extraInfo.yellows} yellow`;
      }
    }

    div.textContent = `${guess}   ${tiles}`;
    container.appendChild(div);
  }
}
