// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",
  tooltip: {
  title: this.label,
  desc: "Next round, one green is revealed for every yellow in the feedback."
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
