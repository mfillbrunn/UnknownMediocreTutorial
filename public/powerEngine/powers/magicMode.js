// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.magicMode.label,
    desc: window.POWER_METADATA.magicMode.desc
  },

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Magic Mode";
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(btn);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_MAGIC_MODE" });
    };
  }
});
