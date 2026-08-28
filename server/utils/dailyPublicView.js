// server/utils/dailyPublicView.js
//
// The exact, explicit whitelist of daily config fields safe to hand to an
// unauthenticated client (REFINEMENT_SPEC section 8) -- pulled out of
// server/index.js's /api/daily route into its own pure function so it has
// a single definition tests can import directly, rather than a shape that
// only exists inline inside an Express handler.
//
// Must NEVER include: cfg.aiOpeningSecret (the AI Secretkeeper's actual
// secret for any round where the human guesses), or cfg.questsByRound/
// rewardOffers/aiPickIndex (hidden future quest/reward detail -- exposing
// a Field Report's exact conditions or a reward's exact three cards before
// the player earns them would defeat the point of both).
function buildPublicDailyView(cfg) {
  return {
    date: cfg.date,
    playMode: cfg.playMode,
    firstRole: cfg.firstRole,
    aiDifficulty: cfg.aiDifficulty,
    // Predefined opening words are safe to show up front -- the player is
    // about to type/see them anyway, and the front screen needs them to
    // display "Your first guess: CRANE" before Start. null means "you
    // choose" that day.
    humanOpeningGuess: cfg.humanOpeningGuess,
    humanOpeningSecret: cfg.humanOpeningSecret,
    // The AI's opening GUESS is safe (it's a move, not an answer); its
    // opening SECRET is deliberately excluded above.
    aiOpeningGuess: cfg.aiOpeningGuess,
    rewardsFixed: true,
    refreshDisabled: true
  };
}

module.exports = { buildPublicDailyView };
