PowerEngine.register("fakeFeedback", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.fakeFeedback.label,
    desc: window.POWER_METADATA.fakeFeedback.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("fakeFeedback", window.POWER_METADATA.fakeFeedback.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () =>
      sendGameAction({ type: "USE_FAKE_FEEDBACK" });
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.fakeFeedbackActive) return null;
  const meta = POWER_METADATA.fakeFeedback;
  return {
    id: "fakeFeedback",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
