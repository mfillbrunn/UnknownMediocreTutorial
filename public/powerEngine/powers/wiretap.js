// /powers/powers/wiretap.js
//
// Wiretap has a passive part (the always-on "Possible: N" box, driven by
// state.guesserRemainingBox + renderGuesserRemainingBox) and — in bullet/
// blitz only — an active "tap the line" ability: once a round, the count
// updates LIVE as the guesser types, so they can home in on the secret.

function wiretapLiveAllowed(state) {
  return state?.rankMode === "bullet" || state?.rankMode === "blitz";
}
window.wiretapLiveAllowed = wiretapLiveAllowed;

PowerEngine.register("wiretap", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.wiretap.label,
    desc: window.POWER_METADATA.wiretap.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("wiretap", "Tap Line");
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      sendGameAction({ type: "USE_WIRETAP" });
    };
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;
    // No active tap unless this is a bullet/blitz game with the power in play.
    if (!state.activePowers?.includes("wiretap") || !wiretapLiveAllowed(state)) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";
    btn.disabled = !!state.powers?.wiretapActive || !!state.powers?.wiretapUsed;
  }
});

// Push the current draft to the server while the tap is active; it replies
// with wiretapLive.
window.emitWiretapDraft = function (draft) {
  if (!window.state?.powers?.wiretapActive) return;
  if (!window.roomId) return;
  socket.emit("guesserWiretapDraft", { roomId: window.roomId, draft: draft || "" });
};

socket.on("wiretapLive", ({ draft, count, invalid }) => {
  window._wiretapLive = { draft, count, invalid: !!invalid };
  window.renderGuesserRemainingBox?.(window.state?.guesserRemainingBox || { visible: false });
});
