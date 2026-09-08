// UMT_CHALLENGES_V1
"use strict";

async function resolveUserId(context, accessToken) {
  if (!accessToken || typeof accessToken !== "string" || !context.supabase) return null;
  try {
    const { data, error } = await context.supabase.auth.getUser(accessToken);
    return error ? null : data?.user?.id || null;
  } catch {
    return null;
  }
}

module.exports = function registerChallengeSocketHandlers(io, context, { challengeService }) {
  io.on("connection", socket => {
    async function withAuth(payload, cb, fn) {
      try {
        const userId = await resolveUserId(context, payload?.accessToken);
        if (!userId) return cb?.({ ok: false, code: "UNAUTHENTICATED" });
        cb?.(await fn(userId));
      } catch (err) {
        console.warn("[challenges] handler error:", err?.message || err);
        cb?.({ ok: false, code: "CHALLENGE_INTERNAL_ERROR" });
      }
    }

    // Not routed through withAuth: the catalog is a static, public list
    // (challengeRegistry's frozen CHALLENGES/DIFFICULTIES, see
    // getCatalog()) that never reads or reveals anything user-specific --
    // per-player progress/stars live in the browser's own localStorage
    // (see challenges.js's loadProgress), never fetched from here. Routing
    // it through withAuth meant every open of the Challenges screen first
    // paid for a network round trip to Supabase's auth API
    // (resolveUserId -> context.supabase.auth.getUser) just to answer a
    // question that didn't depend on who was asking -- the one thing
    // actually making that screen slow to open.
    socket.on("singlePlayer:getChallenges", (payload, cb) => {
      try {
        cb?.(challengeService.getCatalog());
      } catch (err) {
        console.warn("[challenges] handler error:", err?.message || err);
        cb?.({ ok: false, code: "CHALLENGE_INTERNAL_ERROR" });
      }
    });

    socket.on("singlePlayer:startChallenge", (payload, cb) =>
      withAuth(payload, cb, userId => challengeService.startChallenge({
        socket,
        userId,
        userName: typeof payload?.userName === "string" ? payload.userName.slice(0, 40) : null,
        challengeId: payload?.challengeId,
        difficultyId: payload?.difficulty
      }))
    );

    socket.on("singlePlayer:beginChallenge", (payload, cb) =>
      withAuth(payload, cb, userId => challengeService.beginGameplay({
        socket, userId, roomId: payload?.roomId
      }))
    );

    socket.on("singlePlayer:abandonChallenge", (payload, cb) =>
      withAuth(payload, cb, userId => challengeService.abandon({ userId, roomId: payload?.roomId }))
    );
  });
};
