// core/phases/draft.js
//
// Pre-round power draft (Draft Mode). Both roles now draft the same
// shape: shown 2 candidate powers, picks 1. The guesser's player gets a
// second, independent draft on top of that: 2 candidate Quests, picks 1
// -- see lobby.js's draftEligible block for how the candidate lists are
// built. The setter has no second draft; their other "slot" is the
// always-on Setter Quest (setterQuestServer.js), not a drafted power.
// CompetitiveMode already keeps each role's power set (and the guesser's
// quest) fixed across both rounds regardless of who's holding the role,
// so nothing downstream needs to know a draft happened.

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

    // Single-pick for both roles now: clicking a different candidate just
    // swaps the selection instead of requiring a manual deselect first.
    if (picks.includes(action.power)) {
      state.draftPicks[userId] = picks.filter(p => p !== action.power);
    } else {
      state.draftPicks[userId] = [action.power];
    }

    emitRoomState(roomId, room, io);
    return;
  }

  // Guesser-only: identical shape to DRAFT_PICK but against the separate
  // Quest candidate/pick lists.
  if (action.type === "DRAFT_PICK_QUEST") {
    const userId = action.userId;
    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;
    if (state.players?.[userId]?.role !== "guesser") return;

    const candidates = state.draftQuestCandidates?.[userId] || [];
    if (!candidates.includes(action.quest)) return;

    state.draftQuestPicks ??= {};
    const picks = state.draftQuestPicks[userId] || [];

    if (picks.includes(action.quest)) {
      state.draftQuestPicks[userId] = picks.filter(q => q !== action.quest);
    } else {
      state.draftQuestPicks[userId] = [action.quest];
    }

    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "DRAFT_DONE") {
    const userId = action.userId;
    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;

    const role = state.players?.[userId]?.role;
    const picks = state.draftPicks?.[userId] || [];
    if (picks.length !== 1) return;

    if (role !== "setter") {
      const questPicks = state.draftQuestPicks?.[userId] || [];
      if (questPicks.length !== 1) return;
    }

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

  // Auto-fill anyone who didn't lock in their picks (only reachable via
  // the 30s timeout path — DRAFT_DONE itself requires the full set).
  for (const player of Object.values(state.players || {})) {
    const uid = player.userId;
    const picks = state.draftPicks?.[uid] || [];
    if (picks.length < 1) {
      const candidates = state.draftCandidates?.[uid] || [];
      const remaining = shuffle(candidates.filter(p => !picks.includes(p)));
      state.draftPicks ??= {};
      state.draftPicks[uid] = [...picks, ...remaining.slice(0, 1 - picks.length)];
    }

    if (player.role !== "setter") {
      const qPicks = state.draftQuestPicks?.[uid] || [];
      if (qPicks.length < 1) {
        const qCandidates = state.draftQuestCandidates?.[uid] || [];
        const remaining = shuffle(qCandidates.filter(q => !qPicks.includes(q)));
        state.draftQuestPicks ??= {};
        state.draftQuestPicks[uid] = [...qPicks, ...remaining.slice(0, 1 - qPicks.length)];
      }
    }
  }

  const sP = state.draftPicks[state.setter] || [];
  const gP = state.draftPicks[state.guesser] || [];
  const gQuest = (state.draftQuestPicks[state.guesser] || [])[0] || null;

  state.mode.onLobbyReady(state, sP, gP, gQuest);
  state.phase = "simultaneous";

  delete state.draftCandidates;
  delete state.draftPicks;
  delete state.draftQuestCandidates;
  delete state.draftQuestPicks;
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
