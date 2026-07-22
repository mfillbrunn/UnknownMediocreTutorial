// /powers/powers/hideTile.js — Hide Evidence (setter)
//
// The setter picks exactly which tile of the pending guess loses its
// feedback by tapping it directly in the pending-guess row, instead of a
// random tile being chosen server-side. The power tray button is a status
// label only (charges/turn eligibility, same generic enable/disable every
// power's button gets) — it has no click handler; the tap-a-tile
// interaction below is the only way to actually activate it.
//
// Mirrors Vowel Refresh: the server directly erases entry.fb/fbGuesser for
// that position (server/powers/powers/hideTileServer.js), so there's
// nothing for this file to mask client-side -- the tile just renders with
// no feedback color, same as any other blanked position.
PowerEngine.register("hideTile", {

  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.hideTile.label,
    desc: window.POWER_METADATA.hideTile.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } = PowerEngine.createPowerButton("hideTile", window.POWER_METADATA.hideTile.label);
    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(wrapper);

    // The button itself has no activation effect -- picking a tile in the
    // pending-guess row (uiEffects below) is the only way to actually use
    // this power. Without any feedback, tapping the button looks like it
    // just does nothing. Nudge the player toward the real interaction.
    btn.onclick = () => {
      window.showPowerPopup?.({
        emoji: window.POWER_METADATA.hideTile.emoji || "🫥",
        title: window.POWER_METADATA.hideTile.label,
        desc: "Tap a letter in your pending guess row to hide its feedback."
      });
    };
  },

  uiEffects(state, role) {
    if (role !== "setter") return;
    const container = document.getElementById("draftSetter");
    const tiles = container?.__draftRows?.pending?.__tiles;
    if (!Array.isArray(tiles) || tiles.length !== 5) return;

    const usable =
      !state.powerUsedThisTurn &&
      window.POWER_RULES?.hideTile?.allowed?.(state, role) === true;

    tiles.forEach((tile, i) => {
      tile.classList.toggle("tile-pickable-hide", usable);
      tile.title = usable ? "Tap to erase this tile's feedback (Hide Evidence)" : "";

      if (tile.__hideTileWired) return;
      tile.__hideTileWired = true;
      tile.addEventListener("click", () => {
        const s = window.state;
        const r = window.myRole;
        const stillUsable =
          s && !s.powerUsedThisTurn &&
          window.POWER_RULES?.hideTile?.allowed?.(s, r) === true;
        if (!stillUsable) return;
        sendGameAction({ type: "USE_HIDE_TILE", index: i });
      });
    });
  }
});

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.hideTileActive) return null;
  const meta = POWER_METADATA.hideTile;
  return {
    id: "hideTile",
    emoji: meta.emoji,
    text: meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
