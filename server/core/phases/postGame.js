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

    let savedLetterProfileMode;
    if (state.activePowers.includes("letterProfile")) {
      savedLetterProfileMode = state.powers.letterProfileMode;
    }

    // Letter Lockout: the "not yet picked by him" pool belongs to the
    // setter POSITION across the whole match, not to whichever specific
    // player happens to hold it in a given round — round 2's setter (the
    // round-1 guesser, post role-swap) must not be able to re-ban a
    // letter round 1's setter already spent.
    let savedLetterLockoutUsedLetters;
    if (state.activePowers.includes("letterLockout")) {
      savedLetterLockoutUsedLetters = state.powers.letterLockoutUsedLetters;
    }

    resetRoundState(room, state, roomId, context);

    if (state.activePowers.includes("revealLetter")) {
      state.powers.revealLetter.mode = savedRevealLetterMode;
    }

    if (state.activePowers.includes("letterProfile")) {
      state.powers.letterProfileMode = savedLetterProfileMode;
    }

    if (state.activePowers.includes("letterLockout")) {
      state.powers.letterLockoutUsedLetters = savedLetterLockoutUsedLetters;
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
    // Dev Mode's confirmed power selection otherwise resets to "pick again"
    // every match — carry it forward so the lobby's picker (and the actual
    // power assignment) keeps remembering the host's last choice.
    freshState._devSetterPowers = prevState._devSetterPowers || null;
    freshState._devGuesserPowers = prevState._devGuesserPowers || null;

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

  // Replay: same as New Match, but locks the lobby's power assignment to
  // exactly what was active last match (see the state._replay*Powers
  // branch in lobby.js) instead of letting it re-roll/re-draft/re-pick.
  if (action.type === "REPLAY_MATCH") {
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
    // Force off so the lobby's draftEligible check can't route this back
    // through a fresh draft — the whole point of Replay is skipping re-pick.
    freshState.draftMode = false;
    freshState._replaySetterPowers = prevState.initialPowers?.setter || [];
    freshState._replayGuesserPowers = prevState.initialPowers?.guesser || [];

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
