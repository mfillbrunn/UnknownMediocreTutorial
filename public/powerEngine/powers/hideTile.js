PowerEngine.register("hideTile", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.hideTile.label,
    desc: window.POWER_METADATA.hideTile.desc
  },

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_hideTile";
    btn.className = "power-btn";
    btn.textContent = "Hide Tile";

    // Goes into the Setter’s power container
    $("setterPowerContainer").appendChild(btn);
    this.buttonEl = btn;
    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_HIDE_TILE" });
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
