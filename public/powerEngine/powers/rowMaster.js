// /powers/powers/rowMaster.js
PowerEngine.register("rowMaster", {
  role: "guesser",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Row Master";
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_ROW_MASTER" });
    };
  },

  historyEffects(entry, isSetter) {
    if (!entry.rowMasterApplied) return;
    if (!isSetter && entry.fbGuesser) {
      entry.fbGuesser = entry.fbGuesser.slice();
      const i = entry.rowMasterApplied;
      if (entry.fbGuesser[i] !== "🟩") entry.fbGuesser[i] = "🟨";
    }
  }
});
