// core/phases/postGame.js

const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const { startGameTimer } = require("../timeouts/timeoutController");
const { emitRoomState, syncTurnOwners } = require("../rooms");

function handleGameOverPhase(room, state, action, roomId, context) {
  const io = context.io;

  // Next round
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {
      return;
    }

    const res = state.mode?.onNextRound?.(state) || {
      phase: "simultaneous",
      resetRound: true
    };

    let savedRevealLetterMode;
    if (state.activePowers.includes("revealLetter")) {
      savedRevealLetterMode = state.powers.revealLetter.mode;
    }

    resetRoundState(room, state, roomId, context);

    if (state.activePowers.includes("revealLetter")) {
      state.powers.revealLetter.mode = savedRevealLetterMode;
    }

    state.phase = res.phase || "simultaneous";
    state.gameOver = false;
    state.gameOverView = "match";
    state.canNextRound = false;

    if (state.timeControl?.enabled) {
      state.paused = false;
      state.isTimerRunning = false;
      state.roundStartTime = Date.now();
      startGameTimer(room, state, roomId, context);
    }

    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitRoomState(roomId, room, io);
    return;
  }

  // New match
  if (action.type === "NEW_MATCH") {
    const prevState = state;
    const freshState = createInitialState();

    freshState.phase = "lobby";
    freshState.hostUserId = prevState.hostUserId;
    freshState.ranked = prevState.ranked;
    freshState.shuffle = prevState.shuffle;
    freshState.powerCount = prevState.powerCount;
    freshState.aiDifficulty = prevState.aiDifficulty;
    freshState.devMode = prevState.devMode;
    freshState.isTutorial = prevState.isTutorial;
    freshState.rankMode = prevState.rankMode;
    freshState.timeControl = { ...prevState.timeControl };

    freshState.players = {};

    const prevPlayers = prevState.players || {};
    const playerIds = Object.keys(prevPlayers);

    for (const userId of playerIds) {
      const prevPlayer = prevPlayers[userId];
      freshState.players[userId] = {
        userId,
        role: prevPlayer.role,
        ready: false,
        name: prevPlayer.name ?? null,
        isAI: !!prevPlayer.isAI
      };
    }

    room.state = freshState;
    syncTurnOwners(room);

    const initialSeconds = freshState.timeControl?.initialSeconds ?? 0;
    for (const userId of Object.keys(freshState.players)) {
      freshState.timeUsed[userId] = 0;
      freshState.roundTimeouts[userId] = 0;
      freshState.timeRemaining[userId] = initialSeconds;
    }

    emitLobbyEvent(io, roomId, { type: "enterLobby" });
    emitRoomState(roomId, room, io);
    return;
  }
}

module.exports = { handleGameOverPhase };
