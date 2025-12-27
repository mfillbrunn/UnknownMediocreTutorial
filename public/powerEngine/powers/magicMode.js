// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",

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
