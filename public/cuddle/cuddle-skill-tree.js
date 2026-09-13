// public/cuddle/cuddle-skill-tree.js
// Read-only reference data for the Cuddle "skill tree" screen: every
// permanent upgrade and boss reward the game can offer, across every add-on
// module, grouped into branches for the tech-tree map. cuddle-ui.js renders
// this; this file only knows about data and how to tell whether the current
// run already owns a given node -- it never mutates game state.
(function () {
  "use strict";

  // Some rewards share a single numeric field in state.upgrades with a
  // second reward from a different pool (for example the "Richer Colours"
  // boss reward and the "Golden Value" round reward both add to
  // state.upgrades.yellowPoints -- the engine itself does not keep them
  // separate). Those nodes report ownership from the same shared field;
  // that is a property of the underlying save data, not an approximation
  // introduced here.
  function upgradeCount(game, key) {
    const value = game?.state?.upgrades?.[key];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function coachState(game) {
    return game?.state?.cuddleCoachExpansion || null;
  }

  function campaignState(game) {
    return game?.state?.cuddleCampaign || null;
  }

  function ownsBossReward(game, id) {
    const coach = coachState(game);
    const owned = coach?.newBossRewardsOwned;
    if (Array.isArray(owned)) return owned.includes(id);
    if (owned && typeof owned === "object") return Boolean(owned[id]);
    return false;
  }

  // A reward with no owned() function at all (rather than one that returns
  // false) means the current save format has no durable flag for it -- it
  // is a one-shot effect (Position Peek) or only ever mutates a field it
  // shares with something else in a way that can't be told apart (Deep
  // Cull's removed-letter list). Those nodes always render as "not yet
  // picked up" rather than guessing.
  const BRANCHES = Object.freeze([
    {
      id: "roundRewards",
      title: "Round Rewards",
      blurb: "Offered after most non-boss stages.",
      nodes: [
        { id: "extraMulligans", icon: "🔄", title: "Second Thoughts", tier: "common", description: "Gain one additional mulligan each round.", owned: g => upgradeCount(g, "extraMulligans") > 0 },
        { id: "yellowPoints", icon: "🟨", title: "Golden Value", tier: "common", description: "Every yellow tile is worth $1 more.", owned: g => upgradeCount(g, "yellowPoints") > 0 },
        { id: "earlyRoundPoint", icon: "⏱️", title: "Quick Cuddle", tier: "common", description: "Each unused guess in the solve bonus is worth $1 more.", owned: g => upgradeCount(g, "earlyRoundPoint") > 0 },
        { id: "questRefreshes", icon: "♻️", title: "Reward Refresh", tier: "common", description: "Gain one refresh whenever you choose a quest reward.", owned: g => upgradeCount(g, "questRefreshes") > 0 },
        { id: "questPoints", icon: "🏅", title: "Quest Value", tier: "common", description: "Quests are worth $5 more. Stacks every time you take it.", owned: g => upgradeCount(g, "questPoints") > 0 },
        { id: "questReroll", icon: "🔄", title: "Second Guess Quest", tier: "common", description: "Gain one charge to reroll your active quest for a different one, any turn you like.", owned: g => upgradeCount(g, "questReroll") > 0 },
        { id: "mulliganSize", icon: "🃏", title: "Bigger Mulligan", tier: "common", description: "Each mulligan may replace one additional card.", owned: g => upgradeCount(g, "mulliganSize") > 0 },
        { id: "categorySense", icon: "🔮", title: "Theme Sense", tier: "rare", description: "From now on, reveal one category at the start of every solution. Stacks.", owned: g => Number(campaignState(g)?.categorySense) > 0 }
      ]
    },
    {
      id: "economyEngines",
      title: "Economy Engines",
      blurb: "Reward pool that pays out for how you play a round, not just for finishing it.",
      nodes: [
        { id: "rainyDay", icon: "🏦", title: "Rainy Day Fund", tier: "common", description: "Every non-boss stage opens by paying 5% interest on your wallet, up to $25. Stacks.", owned: g => upgradeCount(g, "rainyDay") > 0 },
        { id: "encore", icon: "🎬", title: "Encore", tier: "rare", description: "Every third stage you solve pays a $75 encore bonus.", owned: g => upgradeCount(g, "encore") > 0 },
        { id: "hotStreak", icon: "🔥", title: "Hot Streak", tier: "rare", description: "Each guess in a row that pins a new green pays a growing bonus: $5, then $10, then $15. A guess with no new green resets it.", owned: g => upgradeCount(g, "hotStreak") > 0 },
        { id: "vowelBounty", icon: "🅰️", title: "Vowel Bounty", tier: "common", description: "Every vowel in a secret you solve pays $5.", owned: g => upgradeCount(g, "vowelBounty") > 0 },
        { id: "doubleDown", icon: "🎲", title: "Double Down", tier: "legendary", description: "Solve on your very last guess and the whole stage pays double.", owned: g => upgradeCount(g, "doubleDown") > 0 }
      ]
    },
    {
      id: "solvingAids",
      title: "Solving Aids",
      blurb: "Easy difficulty only -- Medium and Hard skip this entire branch.",
      easyOnly: true,
      nodes: [
        { id: "openingInsight", icon: "💡", title: "Opening Insight", tier: "rare", description: "Start every non-boss Wordle with one additional exact-position hint.", owned: g => upgradeCount(g, "openingInsight") > 0 },
        { id: "quickStudy", icon: "⏳", title: "Quick Study", tier: "common", description: "Automatic hints arrive one guess sooner (minimum: every two guesses).", owned: g => upgradeCount(g, "quickStudy") > 0 },
        { id: "candidateNotebook", icon: "📓", title: "Candidate Notebook", tier: "rare", description: "Reveal your single strongest feasible answer next to the theme readout.", owned: g => upgradeCount(g, "candidateNotebook") > 0 },
        { id: "jokerCache", icon: "🃏", title: "Joker Cache", tier: "legendary", description: "Gain two new Jokers at the beginning of every round. Live Joker cards and reserve charges both count.", owned: g => upgradeCount(g, "jokerCache") > 0 },
        { id: "reserveDividend", icon: "🏦", title: "Reserve Dividend", tier: "rare", description: "At a win, earn $5 extra for every unused mulligan and every unused Joker.", owned: g => upgradeCount(g, "reserveDividend") > 0 }
      ]
    },
    {
      id: "cuddleCoach",
      title: "Cuddle Coach",
      blurb: "Permanent upgrades bought from the Coach. Guesser Hint and Earlier Hints are Easy only.",
      nodes: [
        { id: "coachPossibleAnswers", icon: "🎧", title: "Remaining Setter Box", tier: "common", description: "Unlock an exact Secrets Remaining counter next to the theme readout.", owned: g => Boolean(coachState(g)?.possibleAnswersUnlocked) },
        { id: "coachHint", icon: "💡", title: "Guesser Hint", tier: "rare", description: "Gain one exact letter-and-position hint in every eligible round. Stacks up to four hints per round.", easyOnly: true, owned: g => Number(coachState(g)?.hintsPerRound) > 0 },
        { id: "coachEarlierHint", icon: "⏪", title: "Earlier Hints", tier: "rare", description: "Unlock your first Guesser Hint for the next round if needed, then move its permanent start earlier. Stacks until round 1.", easyOnly: true, owned: g => Number(coachState(g)?.hintStartRound ?? 4) < 4 },
        { id: "coachMeterThreshold", icon: "🩶", title: "Softer Cuddle Meter", tier: "common", description: "The Cuddle Meter needs one fewer visible grey tile to fill per stack. Minimum: seven.", owned: g => Number(coachState(g)?.cuddleThresholdStacks) > 0 },
        { id: "coachMeterReward", icon: "🫶", title: "Bigger Cuddle", tier: "common", description: "Improve a full meter's reward in order: mulligan → joker → hint → extra row.", owned: g => Number(coachState(g)?.cuddleRewardTier) > 0 }
      ]
    },
    {
      id: "synergyCombos",
      title: "Synergy Combos",
      blurb: "Owning both halves of a pair turns the combo on permanently.",
      nodes: [
        { id: "compoundCuddle", icon: "🏦", title: "Compound Cuddle", tier: "legendary", description: "Rainy Day Fund + Reserve Dividend: interest doubles its cap and unused Jokers count toward the balance it pays on.", requires: ["rainyDay", "reserveDividend"], owned: g => upgradeCount(g, "rainyDay") > 0 && upgradeCount(g, "reserveDividend") > 0 },
        { id: "goldenStreak", icon: "🔥", title: "Golden Streak", tier: "legendary", description: "Hot Streak + Golden Value: a guess that pins a new yellow keeps the streak alive too.", requires: ["hotStreak", "yellowPoints"], owned: g => upgradeCount(g, "hotStreak") > 0 && upgradeCount(g, "yellowPoints") > 0 },
        { id: "encoreNight", icon: "🎬", title: "Encore Night", tier: "legendary", description: "Encore + Vowel Bounty: every encore also pays $10 for each vowel in that stage's secret.", requires: ["encore", "vowelBounty"], owned: g => upgradeCount(g, "encore") > 0 && upgradeCount(g, "vowelBounty") > 0 },
        { id: "allIn", icon: "🎲", title: "All In", tier: "legendary", description: "Double Down + Hot Streak: a last-guess solve also pays the streak bonus at its highest step.", requires: ["doubleDown", "hotStreak"], owned: g => upgradeCount(g, "doubleDown") > 0 && upgradeCount(g, "hotStreak") > 0 },
        { id: "studyGroup", icon: "📓", title: "Study Group", tier: "legendary", description: "Candidate Notebook + Opening Insight: the notebook lists a second feasible answer.", requires: ["candidateNotebook", "openingInsight"], easyOnly: true, owned: g => upgradeCount(g, "candidateNotebook") > 0 && upgradeCount(g, "openingInsight") > 0 }
      ]
    },
    {
      id: "bossRewards",
      title: "Boss Rewards",
      blurb: "Permanent rewards for clearing a boss round. No ordinary upgrade is offered afterward.",
      nodes: [
        { id: "cullRare", icon: "✂️", title: "Deep Cull", tier: "legendary", description: "Remove three rare letters from the deck and from every future secret." },
        { id: "doubleMulligans", icon: "🔁", title: "Double Mulligans", tier: "legendary", description: "Double the number of mulligans you get each round.", owned: g => upgradeCount(g, "doubleMulligans") > 0 },
        { id: "biggerMulligans", icon: "🖐️", title: "Full Hand Mulligan", tier: "legendary", description: "Every mulligan can now replace up to five cards.", owned: g => upgradeCount(g, "mulliganSize") > 0 },
        { id: "richerColours", icon: "💰", title: "Richer Colours", tier: "legendary", description: "Every yellow and green tile is worth $2 more.", owned: g => upgradeCount(g, "yellowPoints") > 0 },
        { id: "freeVowelSweep", icon: "🅰️", title: "Free Vowel Sweep", tier: "legendary", description: "Each round opens with one random vowel tested for free -- you learn whether it's in the secret, not where.", owned: g => upgradeCount(g, "freeVowelSweep") > 0 },
        { id: "questHead", icon: "🏅", title: "Quest Head Start", tier: "legendary", description: "Quests are worth $10 more for the rest of the run.", owned: g => upgradeCount(g, "questPoints") > 0 },
        { id: "revealGreen", icon: "📍", title: "Position Peek", tier: "legendary", description: "Reveal one hidden position and make that letter reusable for this round." },
        { id: "openingClue", icon: "🔮", title: "Margin Note", tier: "legendary", description: "Reveal that one letter is in the secret at the start of every future non-boss stage -- not where.", owned: g => Number(g?.state?.cuddleBonuses?.openingClue) > 0 },
        { id: "questDoublePick", icon: "✌️", title: "Double Pick", tier: "legendary", description: "Quest reward screens let you choose two options instead of one, for the rest of the run.", owned: g => upgradeCount(g, "questDoublePick") > 0 },
        { id: "questCadence", icon: "❗", title: "Quest Cadence", tier: "legendary", description: "One additional quest is active at the same time, for the rest of the run. Stacks.", owned: g => upgradeCount(g, "questCadence") > 0 },
        { id: "overtimeReward", icon: "➕", title: "Overtime", tier: "legendary", description: "Gain one additional guess every round.", owned: g => Number(g?.state?.megaState?.extraGuesses) > 0 },
        { id: "questPersistReward", icon: "⏳", title: "Lasting Quests", tier: "legendary", description: "Quests stay active for the rest of the round instead of expiring after one guess.", owned: g => Boolean(g?.state?.megaState?.questPersistsForRound) },
        { id: "backupPlanReward", icon: "🧰", title: "Backup Plan", tier: "legendary", description: "Gain one additional mulligan every round.", owned: g => upgradeCount(g, "extraMulligans") > 0 },
        { id: "clearSight", icon: "🟢", title: "Clear Sight", tier: "legendary", description: "Upgrade Margin Note: it now reveals a letter's exact position instead of just that it's present.", owned: g => ownsBossReward(g, "clearSight") },
        { id: "allThemesBoss", icon: "🔮", title: "All-Seeing Atlas", tier: "legendary", description: "Reveal every available theme at the start of every non-boss Wordle.", owned: g => ownsBossReward(g, "umtAllThemes") },
        { id: "goldenCompass", icon: "🧭", title: "Golden Compass", tier: "legendary", description: "Once per round, reveal the most useful untested letter among the remaining possible answers.", owned: g => ownsBossReward(g, "goldenCompass") },
        { id: "secondCup", icon: "☕", title: "Second Cup", tier: "legendary", description: "Once per run, automatically add one rescue row when the final row would fail.", owned: g => ownsBossReward(g, "secondCup") },
        { id: "goldenThread", icon: "🧵", title: "Golden Thread", tier: "legendary", description: "A full five-letter draft pulses and vibrates when it contains an answer letter you have not learned yet.", owned: g => ownsBossReward(g, "goldenThread") }
      ]
    }
  ]);

  function isOwned(game, node) {
    if (!game || typeof node.owned !== "function") return false;
    try {
      return Boolean(node.owned(game));
    } catch (_error) {
      return false;
    }
  }

  window.CuddleSkillTree = Object.freeze({ BRANCHES, isOwned });
})();
