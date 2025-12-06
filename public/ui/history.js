// /public/ui/history.js — NON-MODULE VERSION

window.renderHistory = function (state, container, isSetter) {
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
      // Setter sees full true feedback
      for (const f of h.fb) tiles += f;
    } else {
      // Guesser sees masked & modified feedback
      for (let i = 0; i < 5; i++) {
        if (h.hiddenIndices?.includes(i)) {
          tiles += "❓";
        } else {
          tiles += h.fbGuesser[i];
        }
      }

      // Count-only mode info
      if (h.extraInfo) {
        tiles += `  (${h.extraInfo.greens}🟩, ${h.extraInfo.yellows}🟨)`;
      }
    }

    div.textContent = `${guess}   ${tiles}`;
    container.appendChild(div);
  }
};
