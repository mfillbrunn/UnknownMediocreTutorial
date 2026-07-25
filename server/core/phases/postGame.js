// core/phases/postGame.js

const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const { emitRoomState, syncTurnOwners } = require("../rooms");
const { advanceToNextRound } = require("../transitions/nextRoundTransition");

function handleGameOverPhase(room, state, action, roomId, context) {
  const io = context.io;

  // Next round
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {
      return;
    }

    advanceToNextRound(room, state, roomId, context);
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
    freshState.tutorialStage = prevState.tutorialStage || 1;
    freshState.tutorialPowerId = prevState.tutorialPowerId || null;
    freshState.rankMode = prevState.rankMode;
    freshState.timeControl = { ...prevState.timeControl };
    // Dev Mode's confirmed power selection otherwise resets to "pick again"
    // every match — carry it forward so the lobby's picker (and the actual
    // power assignment) keeps remembering the host's last choice.
    freshState._devSetterPowers = prevState._devSetterPowers || null;
    freshState._devGuesserPowers = prevState._devGuesserPowers || null;
    // Same idea for custom mode: keep the host's mode choice and each
    // player's last-picked loadout so the lobby doesn't reset to "pick
    // again" every match.
    freshState.customPowersMode = !!prevState.customPowersMode;
    freshState._customPlayerLoadouts = prevState._customPlayerLoadouts || null;

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
    freshState.tutorialStage = prevState.tutorialStage || 1;
    freshState.tutorialPowerId = prevState.tutorialPowerId || null;
    freshState.rankMode = prevState.rankMode;
    freshState.timeControl = { ...prevState.timeControl };
    // Force off so the lobby's draftEligible check can't route this back
    // through a fresh draft — the whole point of Replay is skipping re-pick.
    freshState.draftMode = false;
    freshState.customPowersMode = !!prevState.customPowersMode;
    if (prevState.customPowersMode) {
      // Custom mode has no single shared setter/guesser pool to replay --
      // pin each player's own last loadout instead (consumed by the
      // customEligible branch in lobby.js).
      freshState._replayCustomPlayerPowers = prevState.customPlayerPowers || {};
    } else {
      freshState._replaySetterPowers = prevState.initialPowers?.setter || [];
      freshState._replayGuesserPowers = prevState.initialPowers?.guesser || [];
    }

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

    // Replay skips the lobby and jumps straight back into a match with the
    // same settings. To reuse the lobby's full start pipeline (random/
    // custom/replay power assignment, timers, gameStart broadcast) instead
    // of duplicating it, we dispatch a synthetic PLAYER_READY: pre-mark
    // every human except one "starter" as ready, then ready-up the starter
    // -- once the lobby handler sees all humans ready it builds and starts
    // the game. Falls back to the old enter-the-lobby behavior only if there
    // are somehow no humans to start it.
    const humanIds = Object.values(freshState.players)
      .filter(p => !p.isAI)
      .map(p => p.userId);
    const starter =
      humanIds.includes(freshState.hostUserId) ? freshState.hostUserId : humanIds[0];

    if (starter) {
      for (const uid of humanIds) {
        if (uid !== starter) freshState.players[uid].ready = true;
      }
      context.applyAction(
        room,
        freshState,
        { type: "PLAYER_READY", userId: starter },
        roomId,
        context
      );
      return;
    }

    emitLobbyEvent(io, roomId, { type: "enterLobby" });
    emitRoomState(roomId, room, io);
    return;
  }
}

module.exports = { handleGameOverPhase };
