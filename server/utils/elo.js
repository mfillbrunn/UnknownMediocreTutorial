function eloExpected(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function eloDelta(rA, rB, scoreA, k = 32) {
  const expectedA = eloExpected(rA, rB);
  return Math.round(k * (scoreA - expectedA));
}

async function applyRankedElo({ state, room, supabase,winner,tie }) {
  if (!state.ranked) return null;

  const mode = state.rankMode;
  if (!mode) {
    throw new Error("applyRankedElo called without rankMode");
  }

  const socketIds = Object.keys(room.players);
  if (socketIds.length !== 2) return null;

  // Resolve socket IDs by role
  const socketA = socketIds.find(
    id => room.players[id]?.role === "A"
  );
  const socketB = socketIds.find(
    id => room.players[id]?.role === "B"
  );

  if (!socketA || !socketB) {
    throw new Error("Could not resolve both players by role");
  }

  // Resolve USER IDs (this was missing)
  const userA = room.players[socketA].userId;
  const userB = room.players[socketB].userId;
  const scoreA = tie ? 0.5 : winner === "A" ? 1 : 0;
  const scoreB = 1 - scoreA;

  // Fetch profiles by USER ID
  const [{ data: pa }, { data: pb }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userA).single(),
    supabase.from("profiles").select("*").eq("id", userB).single()
  ]);

  if (!pa || !pb) {
    throw new Error("Profile not found for Elo update");
  }

  const rA = pa[`rating_${mode}`];
  const rB = pb[`rating_${mode}`];

  const deltaA = eloDelta(rA, rB, scoreA);
  const deltaB = -deltaA;

  const [resA, resB] = await Promise.all([
    supabase
      .from("profiles")
      .update({
        [`rating_${mode}`]: rA + deltaA,
        [`games_played_${mode}`]: pa[`games_played_${mode}`] + 1,
        [`wins_${mode}`]: pa[`wins_${mode}`] + (scoreA === 1 ? 1 : 0)
      })
      .eq("id", userA),

    supabase
      .from("profiles")
      .update({
        [`rating_${mode}`]: rB + deltaB,
        [`games_played_${mode}`]: pb[`games_played_${mode}`] + 1,
        [`wins_${mode}`]: pb[`wins_${mode}`] + (scoreB === 1 ? 1 : 0)
      })
      .eq("id", userB)
  ]);

  if (resA.error || resB.error) {
    throw new Error("Failed to update both player ratings");
  }

  return {
    userA,
    userB,
    rating_a_before: rA,
    rating_b_before: rB,
    rating_a_after: rA + deltaA,
    rating_b_after: rB + deltaB
  };
}

module.exports = { applyRankedElo };
