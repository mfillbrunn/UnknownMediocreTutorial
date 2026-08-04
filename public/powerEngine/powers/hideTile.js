// /powers/powers/hideTile.js — Hide Evidence (setter), a.k.a. Reset Letter
//
// Usable twice per match. Tapping the power tray button arms letter-picking
// on the setter's own on-screen keyboard -- the next letter key tapped is
// the pick, sent straight to the server, instead of a tile tap or a modal
// grid. handleSetterInput (public/client.js) checks hideTileKbActive() /
// hideTileKbInput() before its normal typing logic, the same interception
// shape public/client/power-keyboard.js already uses for the guesser's
// Recon Sweep / Double Tap.
//
// The server erases entry.fb/fbGuesser for every occurrence of that letter
// across every guess so far this round (server/powers/powers/hideTileServer.js)
// -- same erase-not-mask treatment as Vowel Refresh -- so there's nothing for
// this file to mask client-side: keyboardState.js's live derivation from
// state.history automatically regrays both the keyboard key and the
// affected history tiles (ui/history.js already treats fb[i]==="" as
// "tile-erased").
(function () {
  let armed = false;

  function canArm(state, role) {
    return (
      !!state &&
      role === "setter" &&
      !state.powerUsedThisTurn &&
      window.POWER_RULES?.hideTile?.allowed?.(state, role) === true
    );
  }

  window.hideTileKbActive = function () {
    return armed;
  };

  window.hideTileKbReset = function () {
    armed = false;
  };

  // Called from handleSetterInput. Returns true if the event was consumed.
window.hideTileKbInput = function (event) {
  if (!armed) {
    return false;
  }

  /*
   * Backspace and Enter are swallowed while letter
   * selection is armed.
   */
  if (event.type !== "LETTER") {
    return true;
  }

  const letter =
    String(event.value || "")
      .toUpperCase();

  armed = false;

  PowerEngine
    .powers
    .hideTile
    ?.uiEffects?.(
      window.state,
      window.myRole
    );

  const submitChoice = () => {
    sendGameAction({
      type: "USE_HIDE_TILE",
      letter
    });
  };

  if (
    typeof window.showPowerActionPopup ===
    "function"
  ) {
    window.showPowerActionPopup({
      emoji:
        window.POWER_METADATA
          ?.hideTile
          ?.emoji || "⬛",

      title: `Erase ${letter}?`,

      desc:
        `This removes the clue for ${letter} ` +
        `from every guess so far this round. ` +
        `This cannot be undone.`,

      useLabel: `Erase ${letter}`,
      showUse: true,
      useEnabled: true,
      onUse: submitChoice
    });
  } else if (
    window.confirm(
      `Erase every clue for ${letter}?`
    )
  ) {
    submitChoice();
  }

  return true;
};

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
        if (!canArm(s, window.myRole)) {
          if (armed) { armed = false; this.uiEffects(s, window.myRole); }
          return;
        }
        armed = !armed;
        this.uiEffects(s, window.myRole);
      };
    },

    uiEffects(state, role) {
      if (role !== "setter") return;

      if (armed && !canArm(state, role)) armed = false;

      this.buttonEl?.classList.toggle("power-armed", armed);

      const kb = document.getElementById("keyboardSetter");
      kb?.classList.toggle("keyboard-picking-hide", armed);
    }
  });
})();

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.hideTileActive) return null;
  const meta = POWER_METADATA.hideTile;
  const letters = state.powers?.hideTileLetters || [];
  return {
    id: "hideTile",
    emoji: meta.emoji,
    text: letters.length ? `${meta.label}: ${letters.join(", ")}` : meta.label,
    color: meta.color,
    priority: 20,
    screen: "both"
  };
});
