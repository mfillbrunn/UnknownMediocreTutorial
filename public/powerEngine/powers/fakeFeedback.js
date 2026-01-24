PowerEngine.register("fakeFeedback", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.fakeFeedback.label,
    desc: window.POWER_METADATA.fakeFeedback.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("fakeFeedback", "Fake Feedback");
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () =>
      sendGameAction({ type: "USE_FAKE_FEEDBACK" });
  },
  historyEffects(entry, isSetter) {
  if (!entry.fakeFeedback || isSetter) return;
  const { real, fake } = entry.fakeFeedback;
  entry.fbComposite = mergeFakeFeedback(real, fake);
  // Guesser sees only ambiguity
  entry.fbGuesser = ["?","?","?","?","?"];
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

function mergeFakeFeedback(real, fake) {
  return real.map((r, i) => {
    const f = fake[i];

    if (r === f) return r;

    // Ordered pairs (canonical)
    const pair = [r, f].sort().join("");

    switch (pair) {
      case "⬛🟨": return "gray-yellow";
      case "🟨⬛": return "gray-yellow";
      case "⬛🟩": return "gray-green";
      case "🟩⬛": return "gray-green";
      case "🟨🟩": return "yellow-green";
      case "🟩🟨": return "yellow-green";
      default:    return "unknown";
    }
  });
}
