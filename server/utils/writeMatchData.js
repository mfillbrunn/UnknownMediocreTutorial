function computeMatchResult(state, myRole) {
  const rounds = state.matchRounds || [];

  const points = { A: 0, B: 0 };
  const time = { A: 0, B: 0 };

  rounds.forEach(r => {
    points[r.setter] += r.guessCount;
    time.A += r.time?.A || 0;
    time.B += r.time?.B || 0;
  });

  let winner = null;
  let winReason = "points";

   if (state.timeoutLoser) {
    winner = state.timeoutLoser === "A" ? "B" : "A";
    winReason = "timeout";
  } else {
    // Normal resolution
    if (points.A > points.B) {
      winner = "A";
    } else if (points.B > points.A) {
      winner = "B";
    } else if (time.A !== time.B) {
      winner = time.A <= time.B ? "A" : "B";
      winReason = "time";
    } else {
      winReason = "tie";
    }
  }
  const didWin = winner && myRole === winner;
  const winnerPoints = winner ? points[winner] : points.A;
  const loserPoints = winner ? points[winner === "A" ? "B" : "A"] : points.A;
  return {
    points,
    time,
    winner,
    winReason,        
    didWin,
    winnerPoints,
    loserPoints
  };
}
async function writeMatchHistory({ state, room, supabase, ratingChange }) {

  // Only human players
  const humans = Object.values(room.playersByUserId)
    .filter(p => !p.isAI);

  if (humans.length !== 2) return;

  const playerA = humans.find(p => p.role === "A");
  const playerB = humans.find(p => p.role === "B");

  if (!playerA || !playerB) return;

  const userA = playerA.userId;
  const userB = playerB.userId;

  const {
    winner,
    winReason,
    winnerPoints,
    loserPoints
  } = computeMatchResult(state, null);

  const winnerUserId =
    winner === "A" ? userA :
    winner === "B" ? userB :
    null;

  const scoreA =
    winner === "A" ? winnerPoints :
    winner === "B" ? loserPoints :
    winnerPoints;

  const scoreB =
    winner === "B" ? winnerPoints :
    winner === "A" ? loserPoints :
    winnerPoints;

  const { error } = await supabase.from("matches").insert({
    mode: state.rankMode,
    ranked: state.ranked,

    player_a: userA,
    player_b: userB,

    winner: winnerUserId,
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
