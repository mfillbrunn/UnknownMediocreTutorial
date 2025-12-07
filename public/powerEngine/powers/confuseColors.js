PowerEngine.register("confuseColors", {

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_confuseColors";
    btn.className = "power-btn";
    btn.textContent = "Blue Mode";

    // Setter-only power → add to setter container
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => sendGameAction(roomId, { type: "USE_CONFUSECOLORS" });
  },

  uiEffects(state, role) {},

  historyEffects(entry, isSetter) {
    if (!entry.fbGuesser) return;

    if (entry.confuseApplied) return;

    entry.fbGuesser = entry.fbGuesser.map(tile => {
      if (tile === "🟩" || tile === "🟨") return "🟦";
      return tile; // black stays black
    });

    entry.confuseApplied = true;
  }
});
