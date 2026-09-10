// /powers/powers/secretThemes.js — Secret Themes (guesser)
//
// Always-on, no button to click: a passive card showing which category the
// current secret falls into, re-read every turn (see
// secretThemesServer.js). Same shape as letterProfile.js right next to it,
// deliberately never setting this.buttonEl so
// PowerEngine.updateButtonStates skips it — there's nothing to use, it's
// just a readout.
//
// Visibility follows the grant rather than the value, so the card the
// player just earned is on screen immediately, showing a dash until the
// server's first reading lands.
PowerEngine.register("secretThemes", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.secretThemes.label,
    desc: window.POWER_METADATA.secretThemes.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("secretThemes", window.POWER_METADATA.secretThemes.label);
    this.wrapperEl = wrapper;
    this.tileEl = btn;

    btn.disabled = true;
    btn.classList.add("secret-themes-tile");

    // Same swap letterProfile.js makes: the plain name label gives way to
    // the readout, using the shared .line/.label/.value markup.
    btn.querySelector(".power-btn-label")?.remove();

    const lines = document.createElement("div");
    lines.className = "secret-themes-tile-lines";
    btn.appendChild(lines);
    this.linesEl = lines;

    $("guesserPowerContainer").appendChild(wrapper);
  },

  uiEffects(state, role) {
    if (!this.wrapperEl) return;

    // Hides for a non-guesser rather than returning early: the roles swap
    // at round 2, and a player who was the guesser would otherwise keep
    // the tile on screen as the Secretkeeper, since nothing else repaints
    // it.
    const active = role === "guesser" && !!state.activePowers?.includes("secretThemes");
    this.wrapperEl.style.display = active ? "" : "none";
    if (!active || !this.linesEl) return;

    const label = state.powers?.secretThemesLabel;

    const line = document.createElement("div");
    line.className = "line";
    const key = document.createElement("span");
    key.className = "label";
    key.textContent = "Theme";
    const value = document.createElement("span");
    value.className = "value";
    if (label) {
      value.textContent = label;
    } else {
      // Not populated until the guesser's turn genuinely begins (the
      // server only reads then) -- a dash rather than an empty gap.
      value.textContent = "—";
      value.classList.add("secret-themes-tile-pending");
    }
    line.append(key, value);
    this.linesEl.replaceChildren(line);
  }
});
