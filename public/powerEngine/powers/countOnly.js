PowerEngine.register("countOnly", {

  role: "setter",
tooltip: {
    title: window.POWER_METADATA.countOnly.label,
    desc: window.POWER_METADATA.countOnly.desc
  },


  renderButton(roomId) {
 const { wrapper, btn } =    PowerEngine.createPowerButton("countOnly", window.POWER_METADATA.countOnly.label);
 this.wrapperEl = wrapper;   
 this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);


    btn.onclick = () =>
      sendGameAction({ type: "USE_COUNT_ONLY" });
  },

  // Guesser sees a modified UI when power is active
  uiEffects(state, role) {
    if (role !== "guesser") return;
    if (!state.powers.countOnlyActive) return;
  },

  // Hide feedback from the guesser
  historyEffects(entry, isSetter) {
    if (isSetter) return;
    if (!entry.extraInfo) return;
    entry._useHiddenCycle = true;
    //entry.fbGuesser = ["❓","❓","❓","❓","❓"];
  }
});

// --------------------------------------------------
// Count Only — info badge (both players)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  const meta = POWER_METADATA.countOnly;

  // Find the most recent history entry where Count Only applied
  const entry = [...state.history]
    .reverse()
    .find(e => e.countOnlyApplied && e.extraInfo);

  if (!entry) return null;
  if (role === "setter" && state.powers.countOnlyActive===false) { return null};
  if (role === "guesser" && state.powers?.blindGuessActive) return null;
  const { greens, yellows, total } = entry.extraInfo;
  const word = state.powers.countOnlyWord.toUpperCase(); 
  return {
    id: "countOnly",
    emoji: meta.emoji,
    text: `${meta.label}: ${word} ${greens}🟩 ${yellows}🟨`,
    color: meta.color,
    priority: 16,
    screen: "both",
    details: meta.desc
  };
});
