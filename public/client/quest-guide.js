// client/quest-guide.js — optional keyboard highlighting aid for the
// letter-range/order/rare-letter guesser quests (HALF_AM "A to P", HALF_NZ
// "K to Z", ALPHA "Alphabetical Order", RARE "Rare Letters"). Purely a
// local, opt-in rendering overlay -- never touches game state or the
// server, just adds a highlight class to keys on the guesser's own real
// keyboard. Toggled from the quest badge's info popup (see quest.js's
// btn.onclick).
//
// RANGE mode (HALF_AM/HALF_NZ): static -- highlights every key inside the
// quest's valid letter range (A-P or K-Z), matching questServer.js's
// isInLetterRange bounds exactly.
//
// ALPHA mode: highlights, relative to the LAST letter in the guesser's
// current draft, which keys would be valid to type NEXT (the word is
// built left to right, so the new letter always lands after the current
// last one) -- alphabetically later keys for the ascending (A->Z)
// direction, alphabetically earlier keys for descending (Z->A). Recomputed
// on every keyboard render off the live draft (see client.js's call into
// applyQuestGuideHighlight right after renderKeyboard) -- never
// intercepts a keystroke, so normal typing is completely unaffected.
//
// RARE mode: highlights whichever of this match's 7 drawn rare letters
// (state.powers.quest.rareLetters, see questServer.js's pickRareLetterSet)
// haven't appeared in a guess yet -- also recomputed live, since which
// ones remain shrinks as the guesser types.
(function () {
  let guideState = null; // null | {questType, type:"RANGE", min, max} | {questType:"ALPHA", type:"ALPHA", direction:"ASC"|"DESC"} | {questType:"RARE", type:"RARE"}

  // Matches quest.js's own legacy fallback -- used only if a live quest
  // somehow has no rareLetters draw yet (shouldn't happen outside the
  // tutorial, which never enables this guide's power/quest UI anyway).
  const DEFAULT_RARE_LETTERS = "QJXZWKV".split("");

  window.setQuestGuideRange = function (questType, min, max) {
    guideState = { questType, type: "RANGE", min, max };
    window.updateUI?.();
  };

  window.setQuestGuideAlpha = function (direction) {
    guideState = { questType: "ALPHA", type: "ALPHA", direction };
    window.updateUI?.();
  };

  window.setQuestGuideRare = function () {
    guideState = { questType: "RARE", type: "RARE" };
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

  window.applyQuestGuideHighlight = function (container, draft, questType, questDone, state) {
    if (!container?.__keys) return;
    for (const keyEl of container.__keys) {
      keyEl.classList.remove("key-guide-hint");
    }

    // Nothing left to guide toward once the quest is claimed -- the popup
    // already stops offering the toggle at that point (see quest.js's
    // guideHtml), but a guide switched on BEFORE the claim would otherwise
    // keep highlighting keys indefinitely since nothing else ever turned
    // it back off. Clear the stored state too, not just this render, so a
    // fresh quest of the same type next round doesn't inherit a stale
    // "on" from before this one was claimed.
    if (questDone) {
      guideState = null;
      return;
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
        const valid = active.direction === "ASC" ? code > ref : code < ref;
        if (valid) keyEl.classList.add("key-guide-hint");
      }
      return;
    }

    if (active.type === "RARE") {
      const q = state?.powers?.quest;
      const pool = q?.rareLetters?.length ? q.rareLetters : DEFAULT_RARE_LETTERS;
      const history = state?.history || [];
      const used = new Set();
      for (const h of history) {
        for (const c of (h.guess || "").toUpperCase()) {
          if (pool.includes(c)) used.add(c);
        }
      }
      for (const keyEl of container.__keys) {
        const symbol = keyEl.dataset.key;
        if (pool.includes(symbol) && !used.has(symbol)) {
          keyEl.classList.add("key-guide-hint");
        }
      }
    }
  };
})();
