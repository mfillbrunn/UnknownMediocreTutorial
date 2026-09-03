PowerEngine.register("feedbackLie", {

  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.feedbackLie.label,
    desc: window.POWER_METADATA.feedbackLie.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("feedbackLie", window.POWER_METADATA.feedbackLie.label);
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () =>
      sendGameAction({ type: "USE_FEEDBACK_LIE" });
  }
});
