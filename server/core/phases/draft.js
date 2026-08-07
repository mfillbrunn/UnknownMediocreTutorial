// core/phases/draft.js

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

function requiredPowerPicks(state, userId) {
  return state.players?.[userId]?.role === "setter" ? 2 : 1;
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

    const picks = [...(state.draftPicks[userId] || [])];
    const target = requiredPowerPicks(state, userId);
    const existingIndex = picks.indexOf(action.power);

    if (existingIndex >= 0) {
      picks.splice(existingIndex, 1);
    } else if (picks.length < target) {
      picks.push(action.power);
    } else if (target === 1) {
      picks.splice(0, picks.length, action.power);
    } else {
      // The first Spy pick is the starting power. Once both slots are full,
      // clicking a third candidate replaces only the locked second slot.
      picks.splice(target - 1, 1, action.power);
    }

    state.draftPicks[userId] = picks;
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "DRAFT_PICK_QUEST") {
    const userId = action.userId;

    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;
    if (state.players?.[userId]?.role !== "guesser") return;

    const candidates = state.draftQuestCandidates?.[userId] || [];
    if (!candidates.includes(action.quest)) return;

    state.draftQuestPicks ??= {};

    const picks = state.draftQuestPicks[userId] || [];

    state.draftQuestPicks[userId] = picks.includes(action.quest)
      ? picks.filter(quest => quest !== action.quest)
      : [action.quest];

    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "DRAFT_DONE") {
    const userId = action.userId;

    if (!userId || !room.playersByUserId[userId]) return;
    if (state.draftDone?.[userId]) return;

    const role = state.players?.[userId]?.role;
    const required = requiredPowerPicks(state, userId);
    const picks = state.draftPicks?.[userId] || [];

    if (picks.length !== required) return;

    if (role !== "setter") {
      const questPicks = state.draftQuestPicks?.[userId] || [];
      if (questPicks.length !== 1) return;
    }

    state.draftDone ??= {};
    state.draftDone[userId] = true;

    emitRoomState(roomId, room, io);
    maybeFinalizeDraft(room, state, roomId, context);
  }
}

function maybeFinalizeDraft(room, state, roomId, context) {
  if (state.phase !== "draft") return;

  const humanUserIds = Object.values(room.playersByUserId || {})
    .filter(player => !player.isAI)
    .map(player => player.userId);

  const allDone = humanUserIds.every(userId => state.draftDone?.[userId]);
  if (!allDone) return;

  finalizeDraft(room, state, roomId, context);
}

function finalizeDraft(room, state, roomId, context) {
  const io = context.io;

  stopDraftTimer(roomId);
  if (state.phase !== "draft") return;

  for (const player of Object.values(state.players || {})) {
    const userId = player.userId;
    const target = requiredPowerPicks(state, userId);
    const picks = [...(state.draftPicks?.[userId] || [])];

    if (picks.length < target) {
      const candidates = state.draftCandidates?.[userId] || [];
      const remaining = shuffle(
        candidates.filter(power => !picks.includes(power))
      );

      state.draftPicks ??= {};
      state.draftPicks[userId] = [
        ...picks,
        ...remaining.slice(0, target - picks.length)
      ];
    }

    if (player.role !== "setter") {
      const questPicks = state.draftQuestPicks?.[userId] || [];

      if (questPicks.length < 1) {
        const candidates = state.draftQuestCandidates?.[userId] || [];
        const remaining = shuffle(
          candidates.filter(quest => !questPicks.includes(quest))
        );

        state.draftQuestPicks ??= {};
        state.draftQuestPicks[userId] = [
          ...questPicks,
          ...remaining.slice(0, 1 - questPicks.length)
        ];
      }
    }
  }

  const setterPowers = state.draftPicks[state.setter] || [];
  const guesserPowers = state.draftPicks[state.guesser] || [];
  const guesserQuest = (state.draftQuestPicks[state.guesser] || [])[0] || null;

  state.mode.onLobbyReady(
    state,
    setterPowers,
    guesserPowers,
    guesserQuest
  );

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

module.exports = {
  handleDraftPhase,
  finalizeDraft,
  shuffle
};
