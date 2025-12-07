PowerEngine.register("hideTile", {

  // ⭐ REQUIRED: Setter is the one who can activate this power.
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_hideTile";
    btn.className = "power-btn";
    btn.textContent = "Hide Tile";

    // Goes into the Setter’s power container
    $("setterPowerContainer").appendChild(btn);

    // ⭐ REQUIRED for powerEngine.js to control disabled / used states
    this.buttonEl = btn;

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_HIDETILE" });
  },

  // Guesser sees hidden tiles in the history
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.hiddenIndices) return;

    entry.hiddenIndices.forEach(idx => {
      entry.fbGuesser[idx] = "❓";
    });
  }
});
