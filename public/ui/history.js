// /public/ui/history.js

/**
 * Render guess history for either setter or guesser.
 *
 * Setter sees:
 *   GUESS + true feedback (🟩🟨⬛🟦)
 *
 * Guesser sees:
 *   GUESS + fbGuesser (with ❓ for hidden tiles)
 *   + optional count-only info:
 *        "Feedback: X green, Y yellow"
 */
export function renderHistory(state, container, isSetter) {
  container.innerHTML = "";

  if (!state?.history?.length) {
    container.textContent = "No guesses yet.";
    return;
  }

  for (const h of state.history) {
    const div = document.createElement("div");
    div.className = "history-row";

    const guess = h.guess.toUpperCase();
    let tiles = "";

    if (isSetter) {
      // Setter sees true fb including blue mode
      for (const f of h.fb) tiles += f;
    } else {
      // Guesser sees altered fbGuesser
      for (let i = 0; i < 5; i++) {
        if (h.hiddenIndices?.includes(i)) {
          tiles += "❓";
        } else {
          tiles += h.fbGuesser[i];
        }
      }

      // Count-only info
      if (h.extraInfo) {
        tiles += `  (${h.extraInfo.greens}🟩, ${h.extraInfo.yellows}🟨)`;
      }
    }

    div.textContent = `${guess}   ${tiles}`;
    container.appendChild(div);
  }
}
