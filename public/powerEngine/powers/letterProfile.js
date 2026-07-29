// /powers/powers/letterProfile.js — Letter Profile (guesser)
//
// Always-on, no button to click -- active from the start of the match, no
// per-turn activation. Still sits in the guesser's own power row (the same
// slot every other power's button would occupy), as a passive card showing
// the live category breakdown (see letterProfileLines in
// client/letterProfile.js) instead of an icon+label the player could tap.
//
// Deliberately never sets this.buttonEl -- PowerEngine.updateButtonStates
// (the generic enable/disable/hide cycle every other power goes through)
// skips any registered power without one, so this card never gets greyed
// out on the opponent's turn or crossed out as "used": there's nothing to
// use, it's just a readout. Visibility (only showing when letterProfile is
// actually in this match's loadout) and the live numbers are instead
// handled by hand in uiEffects below.
PowerEngine.register("letterProfile", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.letterProfile.label,
    desc: window.POWER_METADATA.letterProfile.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("letterProfile", window.POWER_METADATA.letterProfile.label);
    this.wrapperEl = wrapper;
    this.tileEl = btn;

    btn.disabled = true;
    btn.classList.add("letter-profile-tile");

    // Replace the plain name label with a live stats block -- same
    // line/label/value markup letterProfileLines already produces for the
    // old standalone box, just living inside the power-card shape now.
    const labelEl = btn.querySelector(".power-btn-label");
    if (labelEl) {
      labelEl.remove();
    }
    const stats = document.createElement("div");
    stats.className = "letter-profile-tile-lines";
    btn.appendChild(stats);
    this.statsEl = stats;

    $("guesserPowerContainer").appendChild(wrapper);
  },

  uiEffects(state, role) {
    if (role !== "guesser" || !this.wrapperEl) return;

    const active = !!state.activePowers?.includes("letterProfile");
    this.wrapperEl.style.display = active ? "" : "none";
    if (!active) return;

    // Not populated yet at match/round start (server only computes it once
    // the guesser's turn genuinely begins -- see letterProfileServer.js) --
    // a plain dash instead of an empty gap under the icon until then.
    const stat = state.powers?.letterProfileGuesserStat;
    if (this.statsEl) {
      this.statsEl.innerHTML = letterProfileLines(stat) || `<div class="line letter-profile-tile-pending">—</div>`;
    }
  }
});
