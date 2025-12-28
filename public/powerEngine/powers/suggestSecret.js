PowerEngine.register("suggestSecret", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.suggestSecret.label,
    desc: window.POWER_METADATA.suggestSecret.desc
  },
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
  const btn = this.buttonEl;
  if (!btn) return;         // ← prevents crash
  btn.disabled = true;
  btn.classList.add("power-used");
    }
  }
});
