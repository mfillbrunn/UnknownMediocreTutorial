// client/quest-choice.js — mid-match Quest choice (round 2+'s guesser)
//
// Round 1's guesser picks (or is randomly given) their quest before the
// match starts (see draft.js's pre-round picker / competitiveMode.js's
// onLobbyReady). Every later round's guesser is a DIFFERENT player -- the
// standard match always swaps setter/guesser roles between rounds (see
// competitiveMode.js's onNextRound) -- so they no longer just inherit
// whichever quest round 1's guesser had (see nextRoundTransition.js).
// Instead state.powers.quest.pendingChoice holds 2 freshly-randomized
// candidate types and this blocking modal lets them pick one, mirroring
// Draft Mode's guesser quest picker (draft.js's renderDraftCandidateList,
// reused as-is here) but live mid-match instead of on the pre-round draft
// screen. Nothing here is guesser-only information -- safeState.js never
// redacts state.powers.quest, so the setter's client also has
// pendingChoice, but only the guesser's screen ever renders/acts on it.
(function () {
  function updateQuestChoiceModal(state, role) {
    const modal = document.getElementById("questChoiceModal");
    if (!modal) return;

    const pending = state?.powers?.quest?.pendingChoice;
    const shouldShow = role === "guesser" && Array.isArray(pending) && pending.length > 0;

    modal.classList.toggle("active", shouldShow);
    if (!shouldShow) return;

    const list = document.getElementById("questChoiceCandidates");
    if (!list) return;

    renderDraftCandidateList(list, {
      candidates: pending,
      picks: [],
      done: false,
      metaFor: id => window.QUEST_METADATA?.[id],
      onPick: questId => sendGameAction({
        type: "CHOOSE_QUEST",
        quest: questId,
        userId: window.currentUser.id
      })
    });
  }
  window.updateQuestChoiceModal = updateQuestChoiceModal;
})();
