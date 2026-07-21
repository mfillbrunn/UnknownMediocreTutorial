// core/phases/lobby.js

const { emitLobbyEvent } = require("../../utils/emitLobby");
const CompetitiveMode = require("../modes/competitiveMode");
const TutorialMode = require("../modes/tutorialMode");
const { resetRoundTimer } = require("../../utils/Timer");
const { stopAllRoomIntervals } = require("../../utils/teardown");
const { createInitialState } = require("../stateFactory");
const { startGameTimer } = require("../timeouts/timeoutController");
const { startDraftTimer } = require("../../utils/draftTimer");
const { finalizeDraft, shuffle } = require("./draft");
const { QUEST_TYPES } = require("../../powers/powers/questServer");
const { isLoadoutValid } = require("../../powers/POWER_POINTS");
const { pickRandomAILoadout } = require("../../powers/randomLoadout");
const {
  ensureStatePlayer,
  setPlayerName,
  setPlayerReady,
  clearAllReady,
  setPlayerRole,
  addAIPlayer,
  emitRoomState,
  syncTurnOwners
} = require("../rooms");
const { markDailyStarted } = require("../dailyTracking");

const SETTER_POWERS = [
  "hideTile",
  "suggestSecret",
  "confuseColors",
  "countOnly",
  "blindSpot",
  "vowelRefresh",
  "forceGuess",
  "blindGuess",
  "fakeFeedback",
  "revealPenalty",
  "delayedIntel"
  // letterLockout ("forbid a letter") deliberately excluded -- disabled
  // from random/draft pools, same precedent as assassinWord above.
];

// revealLetter and fieldReport are deliberately excluded from this pool --
// their condition-based mechanics live on in the always-on Quest system
// instead (see server/powers/powers/questServer.js), which now covers the
// same ground for every guesser rather than as a power that may or may
// not get rolled/drafted.
const GUESSER_POWERS = [
  "suggestGuess",
  "rouletteSecret",
  "forceTimer",
  "revealHistory",
  "stealthGuess",
  "revealGreen",
  "freezeSecret",
  "magicMode",
  "nonsense",
  "betMiss",
  "wiretap",
  "letterProbe",
  "revealLocation",
  "doubleGuess",
  "letterProfile"
];

function initializePlayerTimers(state, userIds) {
  state.timeUsed ||= {};
  state.roundTimeouts ||= {};
  state.timeRemaining ||= {};

  for (const userId of userIds) {
    state.timeUsed[userId] ??= 0;
    state.roundTimeouts[userId] ??= 0;
    state.timeRemaining[userId] ??= state.timeControl?.initialSeconds ?? 0;
  }
}

function handleLobbyPhase(room, state, action, roomId, context) {
  const io = context.io;

  if (action.type === "PLAYER_JOINED") {
    const userId = action.userId;
    if (!userId) return;

    const playerState = ensureStatePlayer(room, userId);
    if (!playerState) return;

    if (action.name) {
      setPlayerName(room, userId, action.name);
    }

    emitRoomState(roomId, room, io);
    emitLobbyEvent(io, roomId, { type: "playerJoined", userId });
    return;
  }

  if (action.type === "SET_RANKED") {
    if (state.hostUserId !== action.userId) return;
    state.ranked = !!action.ranked;
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SET_SHUFFLE") {
    if (state.hostUserId !== action.userId) return;
    state.shuffle = !!action.shuffle;
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SET_DRAFT_MODE") {
    if (state.hostUserId !== action.userId) return;
    state.draftMode = !!action.draftMode;
    emitRoomState(roomId, room, io);
    return;
  }

  // Three-way power-selection mode: "draft" (current per-round pick),
  // "random" (server-rolled pool), "custom" (each player brings their own
  // point-budgeted loadout, see POWER_POINTS.js). Supersedes SET_DRAFT_MODE
  // above but that action is left in place for anything still using it.
  if (action.type === "SET_POWER_MODE") {
    if (state.hostUserId !== action.userId) return;
    if (!["draft", "random", "custom"].includes(action.mode)) return;
    state.draftMode = action.mode === "draft";
    state.customPowersMode = action.mode === "custom";
    emitRoomState(roomId, room, io);
    return;
  }

  // Custom mode: a player locks in which of their saved loadouts they're
  // bringing to this match. Anyone who reaches Ready without one gets a
  // random valid loadout instead (see the customPowersMode branch below).
  if (action.type === "SET_CUSTOM_LOADOUT") {
    const userId = action.userId;
    if (!userId || !room.playersByUserId[userId]) return;
    const setterPowers = Array.isArray(action.setterPowers) ? action.setterPowers : [];
    const guesserPowers = Array.isArray(action.guesserPowers) ? action.guesserPowers : [];
    if (!isLoadoutValid(setterPowers, guesserPowers)) return;
    state._customPlayerLoadouts ||= {};
    state._customPlayerLoadouts[userId] = { setterPowers, guesserPowers };
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SET_TIME_CONTROL") {
    if (state.hostUserId !== action.userId) return;

    if (action.enabled === false) {
      state.timeControl.enabled = false;
      state.timeControl.preset = "none";
      state.activeTimer = null;
      state.rankMode = "notime";

      for (const userId of Object.keys(state.players || {})) {
        state.timeRemaining[userId] = 0;
      }

      emitRoomState(roomId, room, io);
      return;
    }

    const sec = parseInt(action.seconds, 10);
    const mode = action.mode || "round";
    if (!Number.isFinite(sec) || sec <= 0) return;

    state.timeControl.enabled = true;
    state.timeControl.mode = mode;
    state.timeControl.preset =
      sec === 90 ? "bullet" :
      sec === 180 ? "blitz" :
      sec === 900 ? "deep" :
      "custom";

    if (mode === "round") {
      state.timeControl.roundSeconds = sec;
    } else {
      state.timeControl.initialSeconds = sec;
    }

    for (const userId of Object.keys(state.players || {})) {
      state.timeRemaining[userId] = sec;
    }

    if (action.seconds === 90 && action.mode === "round") state.rankMode = "bullet";
    else if (action.seconds === 180 && action.mode === "round") state.rankMode = "blitz";
    else if (action.seconds === 300 && action.mode === "chess") state.rankMode = "blitz";
    else if (action.seconds === 900) state.rankMode = "deep";
    else state.rankMode = "custom";

    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SWITCH_ROLES") {
    if (state.ranked) return;
    if (state.hostUserId !== action.userId) return;

    const players = Object.values(state.players || {});
    if (players.length !== 2) return;

    const setterPlayer = players.find((p) => p.role === "setter");
    const guesserPlayer = players.find((p) => p.role === "guesser");
    if (!setterPlayer || !guesserPlayer) return;

    setPlayerRole(room, setterPlayer.userId, "guesser");
    setPlayerRole(room, guesserPlayer.userId, "setter");
    clearAllReady(room);

    emitLobbyEvent(io, roomId, { type: "rolesSwitched" });
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "ADD_AI") {
    if (state.ranked) return;
    if (state.hostUserId !== action.userId) return;
    if (room.playersByUserId["AI"]) return;

    const humanCount = Object.values(room.playersByUserId || {}).filter((p) => !p.isAI).length;
    if (humanCount >= 2) return;

    state.aiDifficulty = action.difficulty ?? 1;

    addAIPlayer(room, state.aiDifficulty);
    clearAllReady(room);

    emitLobbyEvent(io, roomId, {
      type: "playerJoined",
      userId: "AI",
      isAI: true
    });

    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SET_DEV_MODE") {
    state.devMode = !state.devMode;
    state.powerCount = state.devMode ? 20 : 2;
    emitRoomState(roomId, room, io);
    return;
  }

  if (action.type === "SET_DEV_POWERS") {
    if (state.hostUserId !== action.userId) return;
    state._devSetterPowers = Array.isArray(action.setterPowers)
      ? action.setterPowers.filter(p => SETTER_POWERS.includes(p))
      : null;
    state._devGuesserPowers = Array.isArray(action.guesserPowers)
      ? action.guesserPowers.filter(p => GUESSER_POWERS.includes(p))
      : null;
    // An explicit re-pick here should win over a pending Replay lock,
    // otherwise the host's new choice would silently be ignored in favor
    // of whatever powers were active last match.
    state._replaySetterPowers = null;
    state._replayGuesserPowers = null;
    emitRoomState(roomId, room, io);
    return;
  }
if (action.type === "SET_DAILY_POWERS") {
  state._dailySetterPowers = action.setterPowers || null;
  state._dailyGuesserPowers = action.guesserPowers || null;
  state._dailyDate = action.date || null;
  if (action.userId && action.date) {
    markDailyStarted(action.userId, action.date, roomId);
  }
  return;
}
  if (action.type === "PLAYER_READY") {
    const userId = action.userId;
    if (!userId) return;
    if (!room.playersByUserId[userId]) return;

    // The client marks the scripted "Start Interactive Tutorial" ready-up
    // with mode: "tutorial" — nothing else ever sets isTutorial, so
    // without this the lobby->game transition below always carries
    // forward isTutorial: false and TutorialMode never actually engages.
    // "tutorial2" is the follow-up powers tutorial (one guesser power, one
    // setter power) — same mechanism, tutorialStage picked up by
    // TutorialMode.initMatch below via freshState.
    if (action.mode === "tutorial") {
      state.isTutorial = true;
      state.tutorialStage = 1;
    }
    if (action.mode === "tutorial2") {
      state.isTutorial = true;
      state.tutorialStage = 2;
    }

    const nowReady = !state.players[userId]?.ready;
    setPlayerReady(room, userId, nowReady);

    if (!nowReady) {
      emitRoomState(roomId, room, io);
      return;
    }

    const allPlayers = Object.values(state.players || {});

    // Need two players in the room (human + human, or human + AI) before
    // a single ready-up can start the game.
    if (allPlayers.length < 2) {
      emitRoomState(roomId, room, io);
      return;
    }

    const humans = allPlayers.filter((p) => !p.isAI);
    const readyHumans = humans.filter((p) => p.ready);

    if (readyHumans.length < humans.length) {
      emitRoomState(roomId, room, io);
      return;
    }

    stopAllRoomIntervals(roomId, room);

    const freshState = createInitialState();
    freshState.players = {};

    for (const player of Object.values(state.players || {})) {
      freshState.players[player.userId] = {
        userId: player.userId,
        role: player.role,
        ready: false,
        name: player.name,
        isAI: !!player.isAI
      };
    }

    // Shuffle roles: the lobby's "Random" toggle (state.shuffle) promises
    // to "randomly assign who's Spy and who's Inspector when the match
    // starts", but nothing ever actually re-rolled the roles -- the host
    // is fixed as setter at room creation (rooms.js's createRoom) and
    // stayed that way unless someone hit Switch Roles by hand. Coin-flip
    // here, once, right as the match is actually starting, so it applies
    // uniformly whether the round ahead goes through Draft or straight to
    // random/dev/daily/replay powers below.
    if (state.shuffle) {
      const ids = Object.keys(freshState.players);
      if (ids.length === 2 && Math.random() < 0.5) {
        const [a, b] = ids;
        const roleA = freshState.players[a].role;
        freshState.players[a].role = freshState.players[b].role;
        freshState.players[b].role = roleA;
      }
    }

    freshState.hostUserId = state.hostUserId;
    freshState.ranked = state.ranked;
    freshState.matchStartedAt = Date.now();
    freshState.shuffle = state.shuffle;
    freshState.draftMode = !!state.draftMode;
    freshState.customPowersMode = !!state.customPowersMode;
    freshState._customPlayerLoadouts = state._customPlayerLoadouts || null;
    freshState._replayCustomPlayerPowers = state._replayCustomPlayerPowers || null;
    freshState.timeControl = { ...state.timeControl };
    freshState.powerCount = state.powerCount;
    freshState.aiDifficulty = state.aiDifficulty;
    freshState.devMode = state.devMode;
    freshState.isTutorial = state.isTutorial;
    freshState.tutorialStage = state.tutorialStage || 1;
    freshState.rankMode = state.rankMode;
     freshState._dailySetterPowers = state._dailySetterPowers || null;
     freshState._dailyGuesserPowers = state._dailyGuesserPowers || null;
     freshState._dailyDate = state._dailyDate || null;
     freshState._devSetterPowers = state._devSetterPowers || null;
     freshState._devGuesserPowers = state._devGuesserPowers || null;
     freshState._replaySetterPowers = state._replaySetterPowers || null;
     freshState._replayGuesserPowers = state._replayGuesserPowers || null;
     freshState.isDaily = !!(
       state._dailySetterPowers &&
       state._dailyGuesserPowers &&
       state._dailyDate
     );
     freshState.dailyDate = state._dailyDate || null;

    room.state = freshState;
    state = freshState;

    syncTurnOwners(room);

    initializePlayerTimers(
      state,
      Object.keys(state.players || {})
    );

    const N = state.powerCount || 2;

    state.mode = state.isTutorial
      ? new TutorialMode()
      : new CompetitiveMode();

    state.mode.initMatch(state);

    // Draft Mode: skip the random pick and let each role's player choose
    // 2 of 3 revealed powers instead. Not compatible with daily challenge
    // (fixed powers), tutorial (scripted powers), or dev mode (wants
    // everything unlocked for testing).
    const draftEligible =
      state.draftMode &&
      !state.customPowersMode &&
      !state.isDaily &&
      !state.isTutorial &&
      !state.devMode;

    // Custom mode: each player brings their own point-budgeted loadout
    // (picked earlier in the lobby via SET_CUSTOM_LOADOUT, or replayed from
    // last match) instead of a shared per-role pool. Mutually exclusive
    // with draft/daily/dev the same way draftEligible already is above.
    const customEligible =
      state.customPowersMode &&
      !state.isDaily &&
      !state.isTutorial &&
      !state.devMode;

    if (customEligible) {
      const playerPowers = {};

      for (const player of Object.values(state.players || {})) {
        const replay = state._replayCustomPlayerPowers?.[player.userId];
        const chosen = state._customPlayerLoadouts?.[player.userId];
        const loadout =
          replay && isLoadoutValid(replay.setterPowers, replay.guesserPowers)
            ? replay
            : chosen && isLoadoutValid(chosen.setterPowers, chosen.guesserPowers)
            ? chosen
            : pickRandomAILoadout();

        playerPowers[player.userId] = {
          setterPowers: loadout.setterPowers.slice(),
          guesserPowers: loadout.guesserPowers.slice()
        };
      }

      state.mode.onLobbyReadyCustom(state, playerPowers);

      state.phase = "simultaneous";

      if (state.timeControl?.enabled) {
        resetRoundTimer(state);
        state.activeTimer = "both";
        state.roundStartTime = Date.now();
        startGameTimer(room, state, roomId, context);
      }

      emitLobbyEvent(io, roomId, { type: "hideLobby" });
      emitRoomState(roomId, room, io);
      io.to(roomId).emit("gameStart");
      return;
    }

    if (draftEligible) {
      state.draftCandidates = {};
      state.draftPicks = {};
      // Guesser-only: a separate offer/pick pair for Quests, alongside
      // (not instead of) their power draft -- setter is untouched (still
      // offered 3 powers, picks 2).
      state.draftQuestCandidates = {};
      state.draftQuestPicks = {};
      state.draftDone = {};

      for (const player of Object.values(state.players || {})) {
        const isGuesser = player.role !== "setter";
        const pool = isGuesser ? GUESSER_POWERS : SETTER_POWERS;
        state.draftCandidates[player.userId] = shuffle(pool).slice(0, isGuesser ? 2 : 3);

        if (isGuesser) {
          state.draftQuestCandidates[player.userId] = shuffle(QUEST_TYPES).slice(0, 2);
        }

        if (player.isAI) {
          const maxPowerPicks = isGuesser ? 1 : 2;
          state.draftPicks[player.userId] =
            shuffle(state.draftCandidates[player.userId]).slice(0, maxPowerPicks);
          if (isGuesser) {
            state.draftQuestPicks[player.userId] =
              shuffle(state.draftQuestCandidates[player.userId]).slice(0, 1);
          }
          state.draftDone[player.userId] = true;
        }
      }

      state.draftDeadline = Date.now() + 30000;
      state.phase = "draft";

      emitLobbyEvent(io, roomId, { type: "hideLobby" });
      emitRoomState(roomId, room, io);
      startDraftTimer(roomId, state, io, () =>
        finalizeDraft(room, state, roomId, context)
      );

      const humanUserIds = Object.values(room.playersByUserId || {})
        .filter((p) => !p.isAI)
        .map((p) => p.userId);
      if (humanUserIds.every((uid) => state.draftDone[uid])) {
        finalizeDraft(room, state, roomId, context);
      }

      return;
    }

    if (Array.isArray(state._replaySetterPowers) && Array.isArray(state._replayGuesserPowers)) {
      // Replay: reuse exactly what was active last match, bypassing daily/
      // dev/random selection entirely (draftEligible is already forced off
      // for this path — see the REPLAY_MATCH handler in postGame.js).
      sP = state._replaySetterPowers;
      gP = state._replayGuesserPowers;
    } else if (state._dailySetterPowers && state._dailyGuesserPowers) {
      sP = state._dailySetterPowers;
      gP = state._dailyGuesserPowers;
    } else if (
      state.devMode &&
      (Array.isArray(state._devSetterPowers) || Array.isArray(state._devGuesserPowers))
    ) {
      // Dev Mode with a confirmed selection: use exactly what the host
      // picked in the power-selection popup, including an intentionally
      // empty side (e.g. "Deselect All" — zero setter powers this match).
      // A side that was never confirmed at all (still null, e.g. the host
      // reloaded mid-lobby) falls back to "all of that role's powers".
      sP = Array.isArray(state._devSetterPowers) ? state._devSetterPowers : SETTER_POWERS.slice();
      gP = Array.isArray(state._devGuesserPowers) ? state._devGuesserPowers : GUESSER_POWERS.slice();
    } else {
      sP = SETTER_POWERS.slice().sort(() => Math.random() - 0.5).slice(0, N);
      gP = GUESSER_POWERS.slice().sort(() => Math.random() - 0.5).slice(0, N);
    }

    state.mode.onLobbyReady(state, sP, gP);

    state.phase = "simultaneous";

    if (state.timeControl?.enabled) {
      resetRoundTimer(state);
      state.activeTimer = "both";
      state.roundStartTime = Date.now();
      startGameTimer(room, state, roomId, context);
    }

    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitRoomState(roomId, room, io);
    io.to(roomId).emit("gameStart");
    return;
  }
}

module.exports = handleLobbyPhase;
