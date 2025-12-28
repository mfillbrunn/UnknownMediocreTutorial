// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.magicMode.label,
    desc: window.POWER_METADATA.magicMode.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("magicMode", "Magic Mode");
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      sendGameAction(roomId, { type: "USE_MAGIC_MODE" });
    };
  }
});
