// client/setter-quest.js — Setter Quest
//
// Always-on setter mechanic (see server/powers/powers/setterQuestServer.js)
// that replaces the setter's second regular power slot -- see lobby.js/
// draft.js, where the setter's regular power pool was cut from 2 down to
// 1 pick. Every time the setter gets a fresh Keep/New decision,
// state.powers.setterQuest.hintLetters holds up to 2 letters (picked
// independently -- they don't have to share a word) that would each
// advance progress by 1 if their NEXT secret contains them -- redacted
// from the guesser entirely (safeState.js), so this whole file only ever
// renders on the setter's own screen. A single switch can push progress
// past the 2-point reward threshold (e.g. "3/2"), and that overflow
// carries into the claim (see setterQuestServer.js's applyReward) -- but
// once already at 2+, no further progress accrues until claimed, so the
// badge's number won't just keep climbing turn after turn. At 2+ the badge's
// tap arms the setter's own keyboard for a letter pick, the exact same
// interaction as Hide Evidence (public/powerEngine/powers/hideTile.js) --
// same interception shape, chained into the same handleSetterInput check
// in client.js -- because the reward IS that power's mechanic, just
// earned through the quest instead of drafted/randomed.
(function () {
  let armed = false;

  function canArm(state) {
    return !!state && (state.powers?.setterQuest?.progress || 0) >= 2;
  }

  function applyUiEffects(state) {
    if (armed && !canArm(state)) armed = false;
    _badge?.btn.classList.toggle("power-armed", armed);
    const kb = document.getElementById("keyboardSetter");
    kb?.classList.toggle("keyboard-picking-hide", armed);
  }

  window.setterQuestKbActive = function () {
    return armed;
  };

  window.setterQuestKbReset = function () {
    armed = false;
    applyUiEffects(window.state);
  };

  // Called from handleSetterInput (client.js). Returns true if the event
  // was consumed.
  window.setterQuestKbInput = function (event) {
    if (!armed) return false;

    // Backspace/Enter are swallowed while a letter pick is armed, same as
    // Hide Evidence.
    if (event.type !== "LETTER") return true;

    const letter = String(event.value || "").toUpperCase();
    armed = false;
    applyUiEffects(window.state);

    const submitChoice = () => {
      window.sendGameAction?.({ type: "USE_SETTER_QUEST_RESET", letter });
    };

    if (typeof window.showPowerActionPopup === "function") {
      window.showPowerActionPopup({
        emoji: "🎯",
        title: `Erase ${letter}?`,
        desc: `This removes the clue for ${letter} from every guess so far this round. This cannot be undone.`,
        useLabel: `Erase ${letter}`,
        showUse: true,
        useEnabled: true,
        onUse: submitChoice
      });
    } else if (window.confirm(`Erase every clue for ${letter}?`)) {
      submitChoice();
    }

    return true;
  };

  let _badge = null;

  function createBadge() {
    const wrapper = document.createElement("div");
    wrapper.className = "power-btn-wrapper";

    const btn = document.createElement("button");
    btn.className = "power-btn power-badge quest-badge-tile setter-quest-badge-tile";

    // No text label -- the card is small and "Setter Quest" ate most of
    // it, crowding out the letters/progress that actually matter turn to
    // turn. "Setter Quest" lives on as the accessible name/tooltip instead
    // of visible text.
    btn.title = "Setter Quest";
    btn.setAttribute("aria-label", "Setter Quest");

    // One plain row: letter, progress, letter -- no pill/chip styling on
    // the progress text, it's just digits like "0/2" sitting between the
    // two letters. features.css scales all three down together (clamp())
    // so the row never overflows the card.
    const row = document.createElement("div");
    row.className = "setter-quest-row";

    const letterLeftEl = document.createElement("span");
    letterLeftEl.className = "setter-quest-hint-letter";
    row.appendChild(letterLeftEl);

    const progressEl = document.createElement("span");
    progressEl.className = "setter-quest-progress-text";
    row.appendChild(progressEl);

    const letterRightEl = document.createElement("span");
    letterRightEl.className = "setter-quest-hint-letter";
    row.appendChild(letterRightEl);

    btn.appendChild(row);
    wrapper.appendChild(btn);
    return { wrapper, btn, progressEl, letterLeftEl, letterRightEl };
  }

  // Called from client.js's updateUI(), right next to updateQuestBadge.
  // Setter-only -- there's nothing for the guesser's screen to show here
  // at all, unlike the guesser quest's read-only mirror on the setter's
  // screen (this one's hint letters have to stay secret from the guesser,
  // so there's no safe partial view to give them).
  function updateSetterQuestBadge(state, role) {
    const container = role === "setter" ? document.getElementById("setterPowerContainer") : null;
    const q = state?.powers?.setterQuest;

    if (!container || !q) {
      if (_badge) { _badge.wrapper.remove(); _badge = null; }
      armed = false;
      return;
    }

    if (!_badge) _badge = createBadge();
    if (container.lastChild !== _badge.wrapper) container.appendChild(_badge.wrapper);

    const { btn, progressEl, letterLeftEl, letterRightEl } = _badge;
    const progress = q.progress || 0;
    const ready = progress >= 2;
    const hints = Array.isArray(q.hintLetters) ? q.hintLetters.map(l => l.toUpperCase()) : [];

    // Both letters and progress are shown right on the card face -- no
    // tap needed to see either. Once ready, no more progress accrues
    // until the reward is claimed (see setterQuestServer.js), but a
    // single switch can still land above 2/2 (e.g. "3/2") -- that
    // overflow carries into the claim, so the raw count keeps showing
    // as-is rather than being clamped for display.
    letterLeftEl.textContent = hints[0] || "–";
    letterLeftEl.classList.toggle("setter-quest-hint-letter-empty", !hints[0]);
    letterRightEl.textContent = hints[1] || "–";
    letterRightEl.classList.toggle("setter-quest-hint-letter-empty", !hints[1]);
    progressEl.textContent = `${progress}/2`;
    btn.classList.toggle("quest-ready", ready);
    btn.classList.toggle("quest-oneaway", progress === 1);
    applyUiEffects(state);

    btn.onclick = () => {
      if (ready) {
        if (!canArm(state)) return;
        armed = !armed;
        applyUiEffects(state);
        return;
      }

      const describeLetter = l => l ? `<strong>${l}</strong>` : "(none available)";
      const hintText = hints.length
        ? `This round's hint letters are ${describeLetter(hints[0])} and ${describeLetter(hints[1])} — switch your secret to a feasible word containing either one to make progress. Matching both letters in one switch is worth 2.`
        : "No hint letters are available right now — wait for the guesser's next guess.";

      window.showPowerActionPopup?.({
        emoji: "🎯",
        title: `Setter Quest: ${progress}/2`,
        desc: `Switch your secret to a feasible word containing this round's hint letters to advance -- matching both at once is worth 2. Progress beyond 2 carries over. At 2+, erase a letter's feedback for the whole round — just like Hide Evidence.`,
        descHtml: `<div>Switch your secret to a feasible word containing this round's hint letters to advance -- matching both at once is worth 2. Progress beyond 2 carries over. At 2+, erase a letter's feedback for the whole round — just like Hide Evidence.</div><div style="margin-top:8px">${hintText}</div>`,
        showUse: false
      });
    };
  }
  window.updateSetterQuestBadge = updateSetterQuestBadge;
})();

// Reward activation shows up in the shared info-badge strip on BOTH
// screens, same as Hide Evidence's own registration -- the guesser sees
// their erased tiles anyway (ui/history.js treats fb[i]==="" as
// "tile-erased"), so naming which letters were reset isn't a new leak,
// just confirmation of what they can already see on the board.
InfoBadgeEngine.register((state) => {
  if (!state.powers?.setterQuestActive) return null;
  const letters = state.powers?.setterQuestLetters || [];
  return {
    id: "setterQuest",
    emoji: "🎯",
    text: letters.length ? `Setter Quest: ${letters.join(", ")}` : "Setter Quest",
    color: "#4da3ff",
    priority: 20,
    screen: "both"
  };
});
