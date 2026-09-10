// /powers/powers/secretThemes.js — Secret Themes (guesser)
//
// Nothing to click: the card fires the moment it's picked as a reward, and
// this tile is purely the readout of what it found. Same passive-card shape
// as letterProfile.js — deliberately no this.buttonEl, so
// PowerEngine.updateButtonStates skips it and it never gets greyed out on
// the opponent's turn or crossed out as "used".
//
// Visibility keys off the revealed data rather than activePowers (which
// letterProfile uses): this is a one-shot reading, so the tile should be
// there exactly when there is a reading to show, and gone again once the
// round transition clears it (clearRoundPowerActivity.js).
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

    // Note this hides the tile for a non-guesser rather than returning
    // early: the roles swap at round 2, and a player who was the guesser
    // would otherwise keep last round's reading on screen as the
    // Secretkeeper, since nothing else would repaint the tile.
    const themes = state.powers?.secretThemesRevealed;
    const has = role === "guesser" && Array.isArray(themes) && themes.length > 0;
    this.wrapperEl.style.display = has ? "" : "none";
    if (!has || !this.linesEl) return;

    this.linesEl.replaceChildren(...themes.map(theme => {
      const line = document.createElement("div");
      line.className = "line";
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = "Theme";
      const value = document.createElement("span");
      value.className = "value";
      value.textContent = theme;
      line.append(label, value);
      return line;
    }));
  }
});
