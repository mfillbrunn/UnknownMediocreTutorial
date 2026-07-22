// /powers/powers/hideTile.js — Hide Evidence (setter)
//
// The setter picks exactly which tile of the pending guess loses its
// feedback by tapping it directly in the pending-guess row, instead of a
// random tile being chosen server-side. The power tray button doesn't
// activate anything itself -- the tap-a-tile interaction below is the
// only way to actually use this power -- it just flashes the pending
// row's tiles (already continuously outlined via tile-pickable-hide
// whenever a charge is available, see uiEffects/powers.css) so tapping
// the button draws the eye straight to which letters are pickable,
// instead of popping up a modal that has to be dismissed first.
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

    btn.onclick = () => {
      const s = window.state;
      const usable =
        s && !s.powerUsedThisTurn &&
        window.POWER_RULES?.hideTile?.allowed?.(s, window.myRole) === true;
      if (!usable) return;

      const tiles = document.getElementById("draftSetter")?.__draftRows?.pending?.__tiles;
      if (!Array.isArray(tiles)) return;
      tiles.forEach(tile => {
        tile.classList.remove("hide-evidence-flash");
        void tile.offsetWidth; // restart the animation if it's already mid-flight
        tile.classList.add("hide-evidence-flash");
        tile.addEventListener(
          "animationend",
          () => tile.classList.remove("hide-evidence-flash"),
          { once: true }
        );
      });
    };
  },

  uiEffects(state, role) {
    if (role !== "setter") return;
    const container = document.getElementById("draftSetter");
    const tiles = container?.__draftRows?.pending?.__tiles;
    if (!Array.isArray(tiles) || tiles.length !== 5) return;

    // Which tile was picked, tracked purely client-side (the server strips
    // powers.hideTilePendingIndex from every broadcast, see safeState.js)
    // so the clicked tile can flip to the "unused" gray look immediately
    // on tap instead of waiting on a round-trip. Scoped to the word it was
    // picked for, so a later, genuinely different pending guess reusing
    // these same DOM tiles doesn't inherit a stale mark.
    if (container.__hideTilePickedFor !== state.pendingGuess) {
      container.__hideTilePickedFor = state.pendingGuess;
      container.__hideTilePickedIndex = null;
    }

    const usable =
      container.__hideTilePickedIndex === null &&
      !state.powerUsedThisTurn &&
      window.POWER_RULES?.hideTile?.allowed?.(state, role) === true;

    tiles.forEach((tile, i) => {
      const picked = container.__hideTilePickedIndex === i;
      tile.classList.toggle("tile-pickable-hide", usable);
      tile.classList.toggle("tile-hide-picked", picked);
      tile.title = usable ? "Tap to erase this tile's feedback (Hide Evidence)" : "";

      if (tile.__hideTileWired) return;
      tile.__hideTileWired = true;
      tile.addEventListener("click", () => {
        const s = window.state;
        const r = window.myRole;
        const stillUsable =
          s && !s.powerUsedThisTurn &&
          container.__hideTilePickedIndex === null &&
          window.POWER_RULES?.hideTile?.allowed?.(s, r) === true;
        if (!stillUsable) return;

        // Mark it immediately -- don't wait for the server round-trip
        // (or even the next render) to gray the tile out.
        container.__hideTilePickedFor = s.pendingGuess;
        container.__hideTilePickedIndex = i;
        tiles.forEach((t, j) => {
          t.classList.toggle("tile-hide-picked", j === i);
          t.classList.remove("tile-pickable-hide");
          t.title = "";
        });

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
