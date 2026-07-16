// core/phases/draft.js
//
// Pre-round power draft (Draft Mode). Each role's player is shown 3 random
// powers for their role and picks exactly 2; those become "the setter
// powers" / "the guesser powers" for the whole match, same as the
// random-assignment path this replaces — CompetitiveMode already keeps
// each role's power set fixed across both rounds regardless of who's
// holding the role, so nothing downstream needs to know a draft happened.

const { emitLobbyEvent } = require("../../utils/emitLobby");
const { resetRoundTimer } = require("../../utils/Timer");
const { startGameTimer } = require("../timeouts/timeoutController");
const { startDraftTimer, stopDraftTimer } = require("../../utils/draftTimer");
const { emitRoomState } = require("../rooms");

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function handleDraftPhase(room, state, action, roomId, context) {
  const io = context.io;

  if (action.type === "DRAFT_PICK") {
    const userId = action.userId;
    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;

    const candidates = state.draftCandidates?.[userId] || [];
    if (!candidates.includes(action.power)) return;

    state.draftPicks ??= {};
    const picks = state.draftPicks[userId] || [];

    if (picks.includes(action.power)) {
      state.draftPicks[userId] = picks.filter(p => p !== action.power);
    } else if (picks.length < 2) {
      state.draftPicks[userId] = [...picks, action.power];
    }

    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "DRAFT_DONE") {
    const userId = action.userId;
    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;

    const picks = state.draftPicks?.[userId] || [];
    if (picks.length !== 2) return;

    state.draftDone ??= {};
    state.draftDone[userId] = true;

    emitRoomState(roomId, room, io);
    maybeFinalizeDraft(room, state, roomId, context);
    return;
  }
}

function maybeFinalizeDraft(room, state, roomId, context) {
  if (state.phase !== "draft") return;

  const humanUserIds = Object.values(room.playersByUserId || {})
    .filter(p => !p.isAI)
    .map(p => p.userId);

  const allDone = humanUserIds.every(uid => state.draftDone?.[uid]);
  if (!allDone) return;

  finalizeDraft(room, state, roomId, context);
}

function finalizeDraft(room, state, roomId, context) {
  const io = context.io;
  stopDraftTimer(roomId);

  if (state.phase !== "draft") return;

  // Auto-fill anyone who didn't lock in 2 picks (only reachable via the
  // 30s timeout path — DRAFT_DONE itself requires exactly 2).
  for (const player of Object.values(state.players || {})) {
    const uid = player.userId;
    const picks = state.draftPicks?.[uid] || [];
    if (picks.length < 2) {
      const candidates = state.draftCandidates?.[uid] || [];
      const remaining = shuffle(candidates.filter(p => !picks.includes(p)));
      state.draftPicks ??= {};
      state.draftPicks[uid] = [...picks, ...remaining.slice(0, 2 - picks.length)];
    }
  }

  const sP = state.draftPicks[state.setter] || [];
  const gP = state.draftPicks[state.guesser] || [];

  state.mode.onLobbyReady(state, sP, gP);
  state.phase = "simultaneous";

  delete state.draftCandidates;
  delete state.draftPicks;
  delete state.draftDone;
  delete state.draftDeadline;

  if (state.timeControl?.enabled) {
    resetRoundTimer(state);
    state.activeTimer = "both";
    state.roundStartTime = Date.now();
    startGameTimer(room, state, roomId, context);
  }

  emitLobbyEvent(io, roomId, { type: "hideLobby" });
  emitRoomState(roomId, room, io);
  io.to(roomId).emit("gameStart");
}

module.exports = { handleDraftPhase, finalizeDraft, shuffle };
