function clearRoundPowerActivity(state) {
  const powers = state?.powers;

  if (!powers) {
    return;
  }

  powers.hideTileActive = 0;

  powers.blindGuessArmed = false;
  powers.blindGuessActive = false;

  powers.rouletteSecretActive = false;
  powers.rouletteSecretFeasible = null;

  powers.forceGuess = null;
  powers.forceGuessOptions = null;
  powers.forceGuessActive = false;

  powers.fakeFeedbackActive = false;
  powers.fakeFeedbackSecret = false;
  powers.fakeFeedbackScramble = false;

  powers.betMissActive = false;
  powers.betMissNumber = null;

  powers.revealGreenPos = null;
  powers.revealGreenLetter = null;
  powers.revealGreenActive = false;

  powers.freezeActive = false;
  powers.confuseColorsActive = false;

  powers.countOnlyWord = "";
  powers.countOnlyActive = false;
  powers.countOnlyRound = -1;

  powers.suggestGuessActive = false;
  powers.suggestSecretActive = false;
  powers.revealHistoryActive = false;

  powers.blindSpotActive = false;
  powers.blindSpotIndex = null;

  powers.stealthGuessActive = false;

  powers.forceTimerActive = false;
  powers.forceTimerSetterPhase = false;
  powers.forceTimerDeadline = null;

  powers.magicModeActive = false;
  powers.magicModeJustUsed = false;

  powers.vowelRefreshLetters = null;
  powers.vowelRefreshPending = false;
  powers.vowelRefreshActive = false;

  powers.nonsenseActive = false;
  powers.nonsenseLastTurn = false;

  /*
   * Preserve assassinWord, assassinPoints, and
   * assassinWordassassinated for the summary.
   */
  powers.assassinWordActive = false;

  powers.fieldReportActive = false;
  powers.fieldReportConditions = null;

  powers.letterProbeResult = null;

  powers.wiretapActive = false;

  powers.revealLocationPeekIndex = null;
  powers.revealLocationPeek = null;

  powers.doubleGuessPending = false;
  powers.doubleGuessHidden = null;
  powers.doubleGuessShownFirst = null;

  powers.letterProfileGuesserStat = null;
  powers.letterLockoutBanned = null;
  powers.delayedIntelRoundIndex = null;

  powers.revealLetterActive = false;

  if (powers.revealLetter) {
    powers.revealLetter.ready = false;
    powers.revealLetter.pendingReveal = null;
  }

  powers.questActive = false;

  if (powers.quest) {
    powers.quest.ready = false;
    powers.quest.oneAway = false;
    powers.quest.claimedEarly = false;
    powers.quest.conditions = null;
  }

  /*
   * Do not leave an unanswered bluff decision active
   * after a surrender or timeout.
   */
  if (
    powers.revealPenaltyUsed &&
    !powers.revealPenaltyResolved
  ) {
    powers.revealPenaltyResolved = true;
  }

  state.powerUsedThisTurn = false;
}

module.exports = {
  clearRoundPowerActivity
};
