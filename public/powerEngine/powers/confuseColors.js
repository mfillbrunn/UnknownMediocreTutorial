PowerEngine.register("confuseColors", {

  // ⭐ REQUIRED: tells the engine this is a setter power
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_confuseColors";
    btn.className = "power-btn";
    btn.textContent = "Blue Mode";

    // Add to Setter’s power area
    $("setterPowerContainer").appendChild(btn);

    // ⭐ REQUIRED: engine uses this to enable/disable/show USED
    this.buttonEl = btn;

    btn.onclick = () =>{
      sendGameAction(roomId, { type: "USE_CONFUSECOLORS" });
  },

  uiEffects(state, role) {
    // Nothing extra needed.
    // The powerEngine updates disabled/used state automatically.
  },

  historyEffects(entry, isSetter) {
    if (!entry.fbGuesser) return;
    if (!entry.confuseApplied) return;

    entry.fbGuesser = entry.fbGuesser.map(tile => {
      // Greens and Yellows appear as Blue
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile;
    });
  }
});
