async function applyRankedElo({ state, room, supabase }) {
  if (!state.ranked) return null;

  const mode = state.rankMode;
  if (!mode) {
    throw new Error("applyRankedElo called without rankMode");
  }

  const ids = Object.keys(room.players);
  if (ids.length !== 2) return null;

  const playerA = ids.find(id => room.players[id] === "A");
  const playerB = ids.find(id => room.players[id] === "B");

  const winner = state.matchWinner; // "A" | "B" | null
  const tie = state.matchWinReason === "tie";

  const scoreA = tie ? 0.5 : winner === "A" ? 1 : 0;
  const scoreB = 1 - scoreA;

  const [pa, pb] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", playerA).single(),
    supabase.from("profiles").select("*").eq("id", playerB).single()
  ]);

  if (!pa.data || !pb.data) {
    throw new Error("Profile not found for Elo update");
  }

  const rA = pa.data[`rating_${mode}`];
  const rB = pb.data[`rating_${mode}`];

  const deltaA = eloDelta(rA, rB, scoreA);
  const deltaB = -deltaA;

  const [resA, resB] = await Promise.all([
    supabase.from("profiles").update({
      [`rating_${mode}`]: rA + deltaA,
      [`games_played_${mode}`]: pa.data[`games_played_${mode}`] + 1,
      [`wins_${mode}`]: pa.data[`wins_${mode}`] + (scoreA === 1 ? 1 : 0)
    }).eq("id", playerA),

    supabase.from("profiles").update({
      [`rating_${mode}`]: rB + deltaB,
      [`games_played_${mode}`]: pb.data[`games_played_${mode}`] + 1,
      [`wins_${mode}`]: pb.data[`wins_${mode}`] + (scoreB === 1 ? 1 : 0)
    }).eq("id", playerB)
  ]);

  if (resA.error || resB.error) {
    throw new Error("Failed to update both player ratings");
  }

  return {
    playerA,
    playerB,
    rating_a_before: rA,
    rating_b_before: rB,
    rating_a_after: rA + deltaA,
    rating_b_after: rB + deltaB
  };
}

module.exports = { applyRankedElo };
