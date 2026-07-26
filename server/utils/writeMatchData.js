// Mirrors public/client/summary.js's computeMatchResult. Points/time are
// tracked per user ID — "A"/"B" were never real keys on state
// (state.roles/state.playerNames don't exist), which used to make this
// always resolve to a tie/no winner and silently corrupt ranked Elo.
function computeMatchResult(state, viewerUserId) {
  const rounds = state.matchRounds || [];

  const points = {};
  const time = {};

  const addPoints = (id, n) => { if (id) points[id] = (points[id] || 0) + (n || 0); };
  const addTime = (id, n) => { if (id) time[id] = (time[id] || 0) + (n || 0); };

  rounds.forEach(r => {
    addPoints(r.setter, r.guessCount);
    for (const [uid, secs] of Object.entries(r.time || {})) {
      addTime(uid, secs);
    }
  });

  const playerIds = Object.keys(state.players || {});
  const [idA, idB] = playerIds;

  let winner = null;
  let tie = false;
  let winReason = "points";

  if (state.timeoutLoser) {
    winner = playerIds.find(id => id !== state.timeoutLoser) || null;
    winReason = "timeout";
  } else {
    const pA = points[idA] || 0;
    const pB = points[idB] || 0;
    if (pA > pB) {
      winner = idA;
    } else if (pB > pA) {
      winner = idB;
    } else {
      const tA = time[idA] || 0;
      const tB = time[idB] || 0;
      if (tA !== tB) {
        winner = tA <= tB ? idA : idB;
        winReason = "time";
      } else {
        tie = true;
        winReason = "tie";
      }
    }
  }

  const didWin = winner != null && viewerUserId != null && winner === viewerUserId;
  const winnerPoints = winner != null ? (points[winner] || 0) : (points[idA] || 0);
  const loserPoints = winner != null
    ? (points[winner === idA ? idB : idA] || 0)
    : (points[idB] || 0);

  return {
    points,
    time,
    winner,
    tie,
    winReason,
    didWin,
    winnerPoints,
    loserPoints
  };
}
async function writeMatchHistory({ state, room, supabase, ratingChange }) {

  const allPlayers = Object.values(room.playersByUserId);
  const humans = allPlayers.filter(p => !p.isAI);
  const aiPlayers = allPlayers.filter(p => p.isAI);

  // Either 2 real players, or exactly 1 real player + 1 AI opponent (the
  // tutorial's single-player room shape -- no AI entry at all -- falls
  // through here and is correctly skipped).
  const isAIMatch = humans.length === 1 && aiPlayers.length === 1;
  if (!isAIMatch && humans.length !== 2) return;

  const [playerA, playerB] = isAIMatch ? [humans[0], aiPlayers[0]] : humans;
  const userA = playerA.userId;
  // AI's userId is the synthetic literal "AI" (server/core/rooms.js), not a
  // real profiles.id -- storing it in player_b would violate the FK
  // constraint the column has to profiles. Leave it null for AI matches;
  // is_ai/ai_difficulty carry the opponent info instead.
  const userB = isAIMatch ? null : playerB.userId;

  const {
    winner,
    winReason,
    winnerPoints,
    loserPoints
  } = computeMatchResult(state, null);

  const winnerUserId = winner;
  const winnerIsAI = isAIMatch && winnerUserId === playerB.userId;
  // Same FK concern as player_b above -- never write the "AI" sentinel id
  // into `winner`. winner_is_ai carries that outcome instead; a tie still
  // reads as winner: null the same way it always has for human matches.
  const dbWinner = winnerIsAI ? null : winnerUserId;

  const scoreA =
    winnerUserId == null ? winnerPoints :
    winnerUserId === userA ? winnerPoints :
    loserPoints;

  const scoreB =
    winnerUserId == null ? winnerPoints :
    winnerUserId === playerB.userId ? winnerPoints :
    loserPoints;

  const { error } = await supabase.from("matches").insert({
    mode: state.rankMode,
    ranked: state.ranked,

    player_a: userA,
    player_b: userB,

    is_ai: isAIMatch,
    ai_difficulty: isAIMatch ? (state.aiDifficulty || null) : null,
    winner_is_ai: winnerIsAI,

    winner: dbWinner,
    win_reason: winReason,

    score_a: scoreA,
    score_b: scoreB,

    rating_a_before: ratingChange?.rating_a_before ?? null,
    rating_b_before: ratingChange?.rating_b_before ?? null,
    rating_a_after: ratingChange?.rating_a_after ?? null,
    rating_b_after: ratingChange?.rating_b_after ?? null,

    time_control: {
      enabled: state.timeControl?.enabled,
      mode: state.timeControl?.mode,
      roundSeconds: state.timeControl?.roundSeconds,
      initialSeconds: state.timeControl?.initialSeconds,
      incrementSeconds: state.timeControl?.incrementSeconds,
      rankMode: state.rankMode
    },

    rounds: JSON.parse(JSON.stringify(state.matchRounds))
  });

  if (error) {
    console.error("Match history insert failed:", error);
    throw error;
  }
}
module.exports = {
  computeMatchResult,
  writeMatchHistory
};
