PowerEngine.register("hideTile", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_hideTile";
    btn.className = "power-btn";
    btn.textContent = "Hide Tile";
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () =>
      sendGameAction(roomId, { type: "USE_HIDETILE" });
  },

  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.hiddenIndices) return;

    entry.hiddenIndices.forEach(idx => {
      entry.fbGuesser[idx] = "❓";
    });
  }
});
