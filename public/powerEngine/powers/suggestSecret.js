PowerEngine.register("suggestSecret", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.id = "power_suggestSecret";
    btn.className = "power-btn";
    btn.textContent = "Suggest Secret";

    $("setterPowerContainer").appendChild(btn);
    this.buttonEl = btn;

    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_SUGGEST_SECRET" });
    };
  },

  effects: {
    onPowerUsed() {
      this.buttonEl.disabled = true;
      this.buttonEl.classList.add("power-used");
    }
  }
});
