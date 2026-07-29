// /powers/powers/revealLocation.js — Informant (guesser)
//
// Always-on, no button to click. The informant peeks one unknown position
// and shows the guesser the current secret's letter there (server-side,
// private to the guesser via state.powers.revealLocationPeek). The
// position stays fixed until the guesser turns it green, then the server
// moves the peek elsewhere.
//
// Sits in the guesser's own power row (the slot every other power's button
// would occupy) as a passive card, same treatment as Letter Profile -- see
// that file's comment for why this never sets buttonEl. Used to live inside
// the remaining-words box instead (client/remaining-words.js); moved here
// so it reads as its own card rather than a line inside an unrelated box.
PowerEngine.register("revealLocation", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.revealLocation.label,
    desc: window.POWER_METADATA.revealLocation.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("revealLocation", window.POWER_METADATA.revealLocation.label);
    this.wrapperEl = wrapper;
    this.tileEl = btn;

    btn.disabled = true;
    btn.classList.add("informant-power-tile");

    // Replace the plain name label with the live peek -- ordinal position
    // plus the letter tile (same .informant-tile look the remaining-words
    // box used to show it with), since there's nothing to click.
    const labelEl = btn.querySelector(".power-btn-label");
    if (labelEl) labelEl.remove();

    const peek = document.createElement("div");
    peek.className = "informant-power-tile-peek";
    btn.appendChild(peek);
    this.peekEl = peek;

    $("guesserPowerContainer").appendChild(wrapper);
  },

  uiEffects(state, role) {
    if (role !== "guesser" || !this.wrapperEl) return;

    const active = !!state.activePowers?.includes("revealLocation");
    this.wrapperEl.style.display = active ? "" : "none";
    if (!active || !this.peekEl) return;

    const peek = state.powers?.revealLocationPeek;
    this.peekEl.innerHTML =
      peek && typeof peek.index === "number" && peek.letter
        ? `<span class="informant-power-tile-ordinal">${ordinal(peek.index + 1)}</span><span class="informant-tile">${peek.letter}</span>`
        : `<span class="informant-power-tile-pending">—</span>`;
  }
});
