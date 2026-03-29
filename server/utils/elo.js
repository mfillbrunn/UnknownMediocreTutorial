function eloExpected(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function eloDelta(rA, rB, scoreA, k = 32) {
  const expectedA = eloExpected(rA, rB);
  return Math.round(k * (scoreA - expectedA));
}

async function applyRankedElo({ state, room, supabase, winner, tie }) {
  if (!state.ranked) return null;

  const mode = state.rankMode;
  if (!mode) {
    throw new Error("applyRankedElo called without rankMode");
  }

  const humans = Object.values(state.players || {}).filter((p) => !p.isAI);
  if (humans.length !== 2) return null;

  const setterPlayer = humans.find((p) => p.role === "setter");
  const guesserPlayer = humans.find((p) => p.role === "guesser");

  if (!setterPlayer || !guesserPlayer) {
    throw new Error("Could not resolve both players by role");
  }

  const userSetter = setterPlayer.userId;
  const userGuesser = guesserPlayer.userId;

  const scoreSetter = tie ? 0.5 : winner === userSetter ? 1 : 0;
  const scoreGuesser = tie ? 0.5 : winner === userGuesser ? 1 : 0;

  const [{ data: pSetter }, { data: pGuesser }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userSetter).single(),
    supabase.from("profiles").select("*").eq("id", userGuesser).single()
  ]);

  if (!pSetter || !pGuesser) {
    throw new Error("Profile not found for Elo update");
  }

  const rSetter = pSetter[`rating_${mode}`];
  const rGuesser = pGuesser[`rating_${mode}`];

  const deltaSetter = eloDelta(rSetter, rGuesser, scoreSetter);
  const deltaGuesser = -deltaSetter;

  const [resSetter, resGuesser] = await Promise.all([
    supabase
      .from("profiles")
      .update({
        [`rating_${mode}`]: rSetter + deltaSetter,
        [`games_played_${mode}`]: pSetter[`games_played_${mode}`] + 1,
        [`wins_${mode}`]: pSetter[`wins_${mode}`] + (scoreSetter === 1 ? 1 : 0)
      })
      .eq("id", userSetter),

    supabase
      .from("profiles")
      .update({
        [`rating_${mode}`]: rGuesser + deltaGuesser,
        [`games_played_${mode}`]: pGuesser[`games_played_${mode}`] + 1,
        [`wins_${mode}`]: pGuesser[`wins_${mode}`] + (scoreGuesser === 1 ? 1 : 0)
      })
      .eq("id", userGuesser)
  ]);

  if (resSetter.error || resGuesser.error) {
    throw new Error("Failed to update both player ratings");
  }

  return {
    userSetter,
    userGuesser,
    rating_setter_before: rSetter,
    rating_guesser_before: rGuesser,
    rating_setter_after: rSetter + deltaSetter,
    rating_guesser_after: rGuesser + deltaGuesser
  };
}

module.exports = { applyRankedElo };
