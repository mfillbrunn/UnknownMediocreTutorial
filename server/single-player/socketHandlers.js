// server/single-player/socketHandlers.js
//
// Thin translation from campaign socket events to SessionService calls.
// Every event is namespaced "singlePlayer:*" so it can never collide with
// an existing multiplayer event name.
//
// Auth: a client payload's userId is NEVER read or trusted here. Every
// handler instead verifies the caller's Supabase access token server-side
// and derives the authenticated UUID from it -- that derived id is the
// only "userId" any of this module or SessionService ever sees. A request
// with a missing/invalid/expired token is rejected before it reaches
// SessionService at all, regardless of what (if anything) the client
// claimed about who it was.

"use strict";

async function resolveAuthenticatedUserId(context, accessToken) {
  if (!accessToken || typeof accessToken !== "string") return null;
  if (!context.supabase) return null;
  try {
    const { data, error } = await context.supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

module.exports = function registerSinglePlayer(io, context, { sessionService }) {
  io.on("connection", (socket) => {
    async function withAuth(payload, cb, handler) {
      try {
        const userId = await resolveAuthenticatedUserId(context, payload?.accessToken);
        if (!userId) {
          const result = { ok: false, code: "UNAUTHENTICATED" };
          cb?.(result);
          return;
        }
        const result = await handler(userId);
        cb?.(result);
      } catch (err) {
        console.warn("[singlePlayer] handler error:", err?.message || err);
        const result = { ok: false, code: "CAMPAIGN_INTERNAL_ERROR" };
        cb?.(result);
        socket.emit("singlePlayer:error", result);
      }
    }

    socket.on("singlePlayer:getCampaign", (payload, cb) =>
      withAuth(payload, cb, (userId) => sessionService.getCampaign(userId))
    );

    socket.on("singlePlayer:startStage", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.startStage({
          socket,
          userId,
          userName: typeof payload?.userName === "string" ? payload.userName.slice(0, 40) : null,
          stageId: payload?.stageId
        })
      )
    );

    socket.on("singlePlayer:resumeStage", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.resumeStage({ socket, userId, roomId: payload?.roomId })
      )
    );

    socket.on("singlePlayer:storyStep", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.storyStep({
          userId,
          roomId: payload?.roomId,
          storyPhase: payload?.storyPhase,
          frameIndex: payload?.frameIndex,
          beatIndex: payload?.beatIndex
        })
      )
    );

    socket.on("singlePlayer:storyChoice", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.storyChoice({
          userId,
          roomId: payload?.roomId,
          choiceId: payload?.choiceId,
          optionId: payload?.optionId
        })
      )
    );

    socket.on("singlePlayer:chooseReward", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.chooseReward({
          userId,
          roomId: payload?.roomId,
          choiceId: payload?.choiceId,
          optionId: payload?.optionId
        })
      )
    );

    socket.on("singlePlayer:completeStage", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.completeStage({ userId, roomId: payload?.roomId })
      )
    );

    socket.on("singlePlayer:abandonStage", (payload, cb) =>
      withAuth(payload, cb, (userId) =>
        sessionService.abandonStage({ userId, roomId: payload?.roomId })
      )
    );
  });
};
