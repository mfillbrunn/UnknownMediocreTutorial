// core/phases/draft.js
//
// Pre-round power draft (Draft Mode). The setter's player is shown 3
// random setter powers and picks 2, same as always. The guesser's player
// gets two independent picks instead: 2 candidate powers (pick 1) AND 2
// candidate Quests (pick 1) -- see lobby.js's draftEligible block for how
// the candidate lists are built. CompetitiveMode already keeps each
// role's power set (and the guesser's quest) fixed across both rounds
// regardless of who's holding the role, so nothing downstream needs to
// know a draft happened.

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

    // room.playersByUserId is transport/session data only (socketId,
    // connected, isAI) -- it has no .role. Roles live on state.players.
    const role = state.players?.[userId]?.role;
    const maxPicks = role === "setter" ? 2 : 1;

    state.draftPicks ??= {};
    const picks = state.draftPicks[userId] || [];

    if (picks.includes(action.power)) {
      state.draftPicks[userId] = picks.filter(p => p !== action.power);
    } else if (maxPicks === 1) {
      // Single-pick (guesser): clicking a different candidate just swaps
      // the selection instead of requiring a manual deselect first.
      state.draftPicks[userId] = [action.power];
    } else if (picks.length < maxPicks) {
      state.draftPicks[userId] = [...picks, action.power];
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
    const requiredPowerPicks = role === "setter" ? 2 : 1;
    const picks = state.draftPicks?.[userId] || [];
    if (picks.length !== requiredPowerPicks) return;

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
    const maxPicks = player.role === "setter" ? 2 : 1;
    const picks = state.draftPicks?.[uid] || [];
    if (picks.length < maxPicks) {
      const candidates = state.draftCandidates?.[uid] || [];
      const remaining = shuffle(candidates.filter(p => !picks.includes(p)));
      state.draftPicks ??= {};
      state.draftPicks[uid] = [...picks, ...remaining.slice(0, maxPicks - picks.length)];
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
