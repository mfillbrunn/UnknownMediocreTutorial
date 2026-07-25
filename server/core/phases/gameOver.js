// core/phases/gameOver.js

const { emitRoomState } = require("../rooms");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { stopTimer } = require("../../utils/Timer");
const { applyRankedElo } = require("../../utils/elo");
const { computeMatchResult, writeMatchHistory } = require("../../utils/writeMatchData");
const { computeRemainingAfterIndexFromState } = require("../../utils/remainingWords");
const { markDailyCompleted } = require("../dailyTracking");
const { advanceToNextRound } = require("../transitions/nextRoundTransition");

function buildArchivedRoundHistory(state, allowedSecrets) {
  const history = Array.isArray(state.history) ? state.history : [];

  return history.map((entry, idx) => {
    const cloned = { ...entry };
    const isFinal = idx === history.length - 1;

    let remainingAfter = 0;
    if (state.timeoutLoser) {
      remainingAfter = "—";
    } else if (isFinal) {
      remainingAfter = 0;
    } else {
      const tempState = {
        ...state,
        history: history.slice(0, idx + 1)
      };
      remainingAfter = computeRemainingAfterIndexFromState(
        idx,
        tempState,
        allowedSecrets
      );
    }

    return {
      ...cloned,
      remainingAfter
    };
  });
}

function endGame(state, roomId, io, room, context) {
  const { supabase } = context;

  if (state.timeControl?.enabled) {
    stopTimer(roomId);
    state.isTimerRunning = false;
  }

  if (!Array.isArray(state.matchRounds)) {
    state.matchRounds = [];
  }

  if (state.powers.assassinWordassassinated) {
    state.guessCount += state.powers.assassinPoints;
  }

  // Marked Weakness has no game-end step -- accept/call always resolves
  // immediately in revealPenaltyServer.js's resolveClaim.

  
const archivedHistory = buildArchivedRoundHistory(
  state,
  context.ALLOWED_SECRETS
);

if (archivedHistory.length > 0) {
  archivedHistory[archivedHistory.length - 1] = {
    ...archivedHistory[archivedHistory.length - 1],
    finalSecret: state.secret || null,
  };
}

state.matchRounds.push({
  setter: state.setter,
  guesser: state.guesser,
  secret: state.secret || null,
  finalSecret: state.secret || null,
  guessCount: state.guessCount,
  time: { ...(state.timeUsed || {}) },
  timeoutLoser: state.timeoutLoser || null,
  history: archivedHistory,
  powers: state.powers
    ? JSON.parse(JSON.stringify(state.powers))
    : {},
  activePowers: Array.isArray(state.activePowers)
    ? state.activePowers.map((x) =>
        x && typeof x === "object" ? { ...x } : x
      )
    : [],
});

  const res = state.mode?.onRoundEnd?.(state) || {
    view: "match",
    canNextRound: false
  };

  if (res.skipSummary) {
    advanceToNextRound(room, state, roomId, context);
    return;
  }

  state.turn = null;
  state.gameOver = true;
  state.phase = "gameOver";
  state.gameOverView = res.view || "match";
  state.canNextRound = !!res.canNextRound;

  if (state.isDaily && !state.canNextRound) {
    const aiPlayer = Object.values(state.players || {}).find((p) => p.isAI);
    for (const player of Object.values(state.players || {})) {
      if (!player.isAI) {
        const { points, time, didWin, tie } = computeMatchResult(state, player.userId);
        markDailyCompleted(player.userId, state.dailyDate, {
          score: points[player.userId] || 0,
          // Both rounds' points combined already live in `points` (each
          // round credits its setter, and the human/AI are setter in
          // exactly one round each) -- opponentScore is just the AI's
          // half of the same totals, so the completed-daily UI can show
          // "you : AI" as one total-score readout instead of just your
          // own number.
          opponentScore: (aiPlayer && points[aiPlayer.userId]) || 0,
          time: time[player.userId] || 0,
          won: didWin,
          tie,
          // Which AI strength the player chose for this run (1 Easy / 2
          // Medium / 3 Hard) -- surfaced on the completed-daily screen and
          // in the shared result, since the same score is a very different
          // achievement against Hard than against Easy.
          difficulty: state.aiDifficulty || null
        });
      }
    }
  }

  const isAIMatch = Object.values(room.playersByUserId || {}).some((p) => p.isAI);

  if (!isAIMatch && !state.canNextRound) {
    const { winner, tie } = computeMatchResult(state, null);

    if (state.ranked) {
      applyRankedElo({ state, room, supabase, winner, tie })
        .then((ratingChange) => {
          // The Elo update is async and lands after the emitRoomState()
          // below already went out — push a follow-up broadcast once the
          // delta is known so the summary screen can show it. room.state
          // may have moved on (new match, room torn down) by the time
          // this resolves, so only apply it to the state it was computed
          // for.
          if (ratingChange && room.state === state) {
            state.eloChange = {
              [ratingChange.userSetter]:
                ratingChange.rating_setter_after - ratingChange.rating_setter_before,
              [ratingChange.userGuesser]:
                ratingChange.rating_guesser_after - ratingChange.rating_guesser_before
            };
            emitRoomState(roomId, room, io);
          }
          return writeMatchHistory({ state, room, supabase, ratingChange });
        })
        .catch((err) => console.error("Ranked match persistence failed:", err));
    } else {
      writeMatchHistory({ state, room, supabase })
        .catch((err) => console.error("Match history write failed:", err));
    }

    emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
    io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
  }

  emitRoomState(roomId, room, io);
}

module.exports = { endGame };
