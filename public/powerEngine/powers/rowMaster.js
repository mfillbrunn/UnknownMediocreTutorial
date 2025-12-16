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
  uiEffects(state, role) {
  if (!this.buttonEl) return;           
  if (role !== "guesser") {             
    this.buttonEl.style.display = "none";
    return;
  }
  if (!state.activePowers.includes("rareLetterBonus")) {
   this.buttonEl.style.display = "none";
   return;
}

  this.buttonEl.style.display = "";

  const ready = state.powers.rowMasterReady;
  const used = state.powers.rowMasterUsed;
  const turn = state.turn === state.guesser;
  const phase = state.phase === "normal";

  if (ready && !used && turn && phase) {
    this.buttonEl.disabled = false;
    this.buttonEl.classList.remove("disabled-btn");
  } else {
    this.buttonEl.disabled = true;
    this.buttonEl.classList.add("disabled-btn");
  }
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
