// client/quest-guide.js — optional keyboard highlighting aid for the
// letter-range/order guesser quests (HALF_AM "A to P", HALF_NZ "K to Z",
// ALPHA "Alphabetical Order"). Purely a local, opt-in rendering overlay --
// never touches game state or the server, just adds a highlight class to
// keys on the guesser's own real keyboard. Toggled from the quest badge's
// info popup (see quest.js's btn.onclick).
//
// RANGE mode (HALF_AM/HALF_NZ): static -- highlights every key inside the
// quest's valid letter range (A-P or K-Z), matching questServer.js's
// isInLetterRange bounds exactly.
//
// ALPHA mode: highlights, relative to the LAST letter in the guesser's
// current draft, which other keys would be valid to place BEFORE it in
// the word -- alphabetically earlier keys for the ascending (A->Z)
// direction, alphabetically later keys for descending (Z->A). Recomputed
// on every keyboard render off the live draft (see client.js's call into
// applyQuestGuideHighlight right after renderKeyboard) -- never
// intercepts a keystroke, so normal typing is completely unaffected.
(function () {
  let guideState = null; // null | {questType, type:"RANGE", min, max} | {questType:"ALPHA", type:"ALPHA", direction:"ASC"|"DESC"}

  window.setQuestGuideRange = function (questType, min, max) {
    guideState = { questType, type: "RANGE", min, max };
    window.updateUI?.();
  };

  window.setQuestGuideAlpha = function (direction) {
    guideState = { questType: "ALPHA", type: "ALPHA", direction };
    window.updateUI?.();
  };

  window.clearQuestGuide = function () {
    guideState = null;
    window.updateUI?.();
  };

  // questType: the CURRENTLY active quest, so a leftover guide from a
  // quest the player no longer has (round transition, role swap into a
  // freshly-chosen quest) doesn't silently keep highlighting stale keys.
  window.getQuestGuideState = function (questType) {
    if (guideState && guideState.questType !== questType) {
      guideState = null;
    }
    return guideState;
  };

  window.applyQuestGuideHighlight = function (container, draft, questType) {
    if (!container?.__keys) return;
    for (const keyEl of container.__keys) {
      keyEl.classList.remove("key-guide-hint");
    }

    const active = window.getQuestGuideState(questType);
    if (!active) return;

    if (active.type === "RANGE") {
      for (const keyEl of container.__keys) {
        const symbol = keyEl.dataset.key;
        if (!/^[A-Z]$/.test(symbol)) continue;
        const code = symbol.charCodeAt(0);
        if (code >= active.min && code <= active.max) {
          keyEl.classList.add("key-guide-hint");
        }
      }
      return;
    }

    if (active.type === "ALPHA") {
      const letters = (draft || "").toUpperCase().split("").filter(c => /^[A-Z]$/.test(c));
      if (!letters.length) return;
      const ref = letters[letters.length - 1].charCodeAt(0);
      for (const keyEl of container.__keys) {
        const symbol = keyEl.dataset.key;
        if (!/^[A-Z]$/.test(symbol)) continue;
        const code = symbol.charCodeAt(0);
        const valid = active.direction === "ASC" ? code < ref : code > ref;
        if (valid) keyEl.classList.add("key-guide-hint");
      }
    }
  };
})();
