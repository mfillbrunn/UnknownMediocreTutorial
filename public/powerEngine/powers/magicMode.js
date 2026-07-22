// /powers/powers/magicMode.js
PowerEngine.register("magicMode", {
  role: "guesser",
tooltip: {
    title: window.POWER_METADATA.magicMode.label,
    desc: window.POWER_METADATA.magicMode.desc
  },

  renderButton(roomId) {
     const { wrapper, btn } =    PowerEngine.createPowerButton("magicMode", window.POWER_METADATA.magicMode.label);
    this.wrapperEl = wrapper;
     this.buttonEl = btn;
        $("guesserPowerContainer").appendChild(wrapper)

    btn.onclick = () => {
      sendGameAction({ type: "USE_MAGIC_MODE" });
    };
  }
});


InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.magicModeActive) return null;
  const meta = POWER_METADATA.magicMode;
  return {
    id: "magicMode",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});

// --------------------------------------------------
// Magic Mode result — one combined splash for every letter this
// activation revealed (magicModeServer.js's postScore batches them into a
// single event so multiple reveals from one use don't stack/overwrite
// each other with separate popups). Nothing to show if it found nothing
// to convert -- the generic activation popup already confirmed the power
// was used (see POWERS_WITH_OWN_POPUP in socketClient.js, which now skips
// that generic popup anyway since this is the real result).
// --------------------------------------------------
socket.on("magicModeRevealed", ({ added }) => {
  if (!Array.isArray(added) || !added.length) return;

  const sub = added
    .map(a => `${a.letter.toUpperCase()} in position ${a.index + 1}`)
    .join(", ");

  window.showBigAnnounce?.({
    icon: "🟩",
    title: added.length > 1
      ? "Magic Mode revealed correct positions!"
      : "Magic Mode revealed a correct position!",
    sub,
    roleClass: "outcome-win",
    duration: 4200
  });
});
