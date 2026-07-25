// /powers/powers/hideTile.js — Hide Evidence (setter)
//
// One-time use per match. Tapping the power tray button arms it -- only
// then do the pending-guess row's tiles start blinking to show they're
// pickable. Tapping one of those tiles is what actually erases its
// feedback (server-side, see below); the button by itself doesn't erase
// anything. Before the button is pressed the tiles carry no special
// styling at all, so there's nothing to notice ahead of time.
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

      const container = document.getElementById("draftSetter");
      if (!container) return;

      // Keep the picked/armed state scoped to the current pending guess --
      // same reset uiEffects does below, done here too so arming takes
      // effect immediately instead of waiting on the next render.
      if (container.__hideTilePickedFor !== s.pendingGuess) {
        container.__hideTilePickedFor = s.pendingGuess;
        container.__hideTilePickedIndex = null;
      }
      if (container.__hideTilePickedIndex !== null) return;

      container.__hideTileArmed = true;
      this.uiEffects(s, window.myRole);
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
    // these same DOM tiles doesn't inherit a stale mark or a stale armed
    // state left over from a previous guess.
    if (container.__hideTilePickedFor !== state.pendingGuess) {
      container.__hideTilePickedFor = state.pendingGuess;
      container.__hideTilePickedIndex = null;
      container.__hideTileArmed = false;
    }

    const usable =
      container.__hideTilePickedIndex === null &&
      !state.powerUsedThisTurn &&
      window.POWER_RULES?.hideTile?.allowed?.(state, role) === true;

    // Blink only the tiles that can actually be tapped right now, and only
    // once the button has been pressed -- no passive highlight beforehand.
    const pickable = usable && !!container.__hideTileArmed;

    tiles.forEach((tile, i) => {
      const picked = container.__hideTilePickedIndex === i;
      tile.classList.toggle("tile-pickable-hide", pickable);
      tile.classList.toggle("tile-hide-picked", picked);
      tile.title = pickable ? "Tap to erase this tile's feedback (Hide Evidence)" : "";

      if (tile.__hideTileWired) return;
      tile.__hideTileWired = true;
      tile.addEventListener("click", () => {
        const s = window.state;
        const r = window.myRole;
        const stillPickable =
          s && !s.powerUsedThisTurn &&
          container.__hideTileArmed &&
          container.__hideTilePickedIndex === null &&
          window.POWER_RULES?.hideTile?.allowed?.(s, r) === true;
        if (!stillPickable) return;

        // Mark it immediately -- don't wait for the server round-trip
        // (or even the next render) to gray the tile out.
        container.__hideTilePickedFor = s.pendingGuess;
        container.__hideTilePickedIndex = i;
        container.__hideTileArmed = false;
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
