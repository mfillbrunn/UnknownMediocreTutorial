PowerEngine.register("blindSpot", {
  role: "setter",
tooltip: {
    title: window.POWER_METADATA.blindSpot.label,
    desc: window.POWER_METADATA.blindSpot.desc
  },


  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Blind Spot";
    this.buttonEl = btn;

    $("setterPowerContainer").appendChild(btn);
    btn.addEventListener("mouseenter", () => {
      console.log("hovering reveal letter");
    });
    btn.onclick = () => {
      if (btn.disabled) return;
      sendGameAction(roomId, { type: "USE_BLIND_SPOT" });
    };
  },

  effects: {
    onPowerUsed(data) {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});
