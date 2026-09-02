// UMT_CHALLENGES_V1
"use strict";

const {
  rooms,
  createRoom,
  setPlayerRole,
  setPlayerName,
  emitRoomState
} = require("../../core/rooms");
const powerMetadata = require("../../powers/powerMetadata");
const { buildRoundPlan } = require("../unlockService");
const SinglePlayerMode = require("../campaignMode");
const { getChallenge, getDifficulty, publicCatalog } = require("./challengeRegistry");

const AI_USER_ID = "AI";
const AI_FORBIDDEN = new Set(["assassinWord", "revealLetter"]);

function rolePowerPool(role) {
  return Object.entries(powerMetadata)
    .filter(([id, meta]) => meta?.role === role && !AI_FORBIDDEN.has(id))
    .map(([id]) => id);
}

function makeStage(challenge, difficulty) {
  const oppositeRole = challenge.powerRole === "setter" ? "guesser" : "setter";
  const opponentFixed = { setter: [], guesser: [] };
  opponentFixed[challenge.powerRole] = [challenge.powerId];
  opponentFixed[oppositeRole] = rolePowerPool(oppositeRole);

  return {
    id: `challenge:${challenge.id}:${difficulty.id}`,
    version: 1,
    title: challenge.title,
    summary: challenge.summary,
    cast: { human: "Player", opponent: "Challenge AI" },
    map: { label: challenge.title, x: 50, y: 50, next: [] },
    game: {
      roles: "both",
      // Put the powered AI role first so the challenge mechanic is shown immediately.
      firstRole: challenge.powerRole === "setter" ? "guesser" : "setter",
      difficulty: difficulty.aiDifficulty,
      powerChoice: false,
      quests: { disabled: false },
      human: {},
      ai: {},
      powerPolicy: {
        playerUsesUnlocks: true,
        rewardsUseUnlocks: true,
        opponentFixed
      }
    },
    objectives: [],
    rewards: {}
  };
}

function normalizeWord(value) {
  return String(value || "").trim().toUpperCase();
}

function roundForHumanRole(state, humanUserId, role) {
  return (state.matchRounds || []).find(r => {
    const humanRole = r?.setter === humanUserId ? "setter" : r?.guesser === humanUserId ? "guesser" : null;
    return humanRole === role;
  }) || null;
}

function humanSolved(round) {
  if (!round) return false;
  const history = Array.isArray(round.history) ? round.history : [];
  const lastGuess = normalizeWord(history[history.length - 1]?.guess);
  const secret = normalizeWord(round.finalSecret || round.secret);
  return !!lastGuess && !!secret && lastGuess === secret;
}

// Newer/older builds have used a few names for the setter's star/bonus score.
// Keep this tolerant so adding a guesser-power challenge does not require
// touching the shared game engine just to expose one field.
function setterStars(round) {
  if (!round) return 0;
  const direct = [
    round.setterStars,
    round.setterScore,
    round.starScore,
    round.stars,
    round.bonusStars
  ].find(Number.isFinite);
  if (Number.isFinite(direct)) return Number(direct);

  const history = Array.isArray(round.history) ? round.history : [];
  return history.reduce((sum, entry) => {
    const n = [entry?.setterStarsEarned, entry?.setterStarDelta, entry?.starBonus, entry?.setterBonus]
      .find(Number.isFinite);
    return sum + (Number.isFinite(n) ? Number(n) : 0);
  }, 0);
}

function scoreChallenge(state, sp) {
  const humanId = sp.humanUserId;
  const guesserRound = roundForHumanRole(state, humanId, "guesser");
  const setterRound = roundForHumanRole(state, humanId, "setter");

  const humanGuessCount = Number(guesserRound?.guessCount) || 0;
  const aiGuessCount = Number(setterRound?.guessCount) || 0;
  // Same comparison implied by campaign facts: as setter you want the AI to
  // need more guesses; as guesser you want to need fewer.
  const margin = aiGuessCount - humanGuessCount;
  const won = humanSolved(guesserRound) && margin > 0;

  const specialPassed = sp.challenge.powerRole === "setter"
    ? humanSolved(guesserRound) && humanGuessCount <= 4
    : setterStars(setterRound) >= 12;

  const stars = won
    ? 1 + (margin >= 3 ? 1 : 0) + (specialPassed ? 1 : 0)
    : 0;

  return {
    challengeResult: true,
    challengeId: sp.challenge.id,
    difficulty: sp.challenge.difficulty,
    powerId: sp.challenge.powerId,
    powerRole: sp.challenge.powerRole,
    won,
    stars,
    margin,
    humanGuessCount,
    aiGuessCount,
    setterStars: setterStars(setterRound),
    specialPassed,
    conditions: {
      win: won,
      margin: won && margin >= 3,
      special: won && specialPassed
    }
  };
}

class ChallengeService {
  constructor({ context, progressRepository, sessionService }) {
    this.context = context;
    this.repo = progressRepository;
    this.sessionService = sessionService;
  }

  getCatalog() {
    return { ok: true, ...publicCatalog() };
  }

  async startChallenge({ socket, userId, userName, challengeId, difficultyId }) {
    const challenge = getChallenge(challengeId);
    const difficulty = getDifficulty(difficultyId);
    if (!challenge) return { ok: false, code: "UNKNOWN_CHALLENGE" };
    if (!difficulty) return { ok: false, code: "UNKNOWN_DIFFICULTY" };

    const profile = await this.repo.ensureProfile(userId);
    if (!profile.ok) return profile;
    const humanUnlockedPowers = await this.repo.getUnlockedPowersByRole(userId);

    const roomId = createRoom(socket, userId);
    const room = rooms[roomId];
    room.isSinglePlayer = true;

    this.context.applyAction(
      room,
      room.state,
      { type: "ADD_AI", userId, difficulty: difficulty.aiDifficulty },
      roomId,
      this.context
    );

    setPlayerName(room, userId, String(userName || "Player").trim() || "Player");
    setPlayerName(room, AI_USER_ID, `${challenge.title} AI`);

    const stage = makeStage(challenge, difficulty);
    const plan = buildRoundPlan({ stage, humanUserId: userId, aiUserId: AI_USER_ID, humanUnlockedPowers });
    const firstRound = plan.rounds[0];
    setPlayerRole(room, firstRound.setterUserId, "setter");
    setPlayerRole(room, firstRound.guesserUserId, "guesser");

    const state = room.state;
    state.timeControl = { enabled: false };
    state.ranked = false;
    state.singlePlayer = {
      enabled: true,
      sessionId: `challenge:${roomId}`,
      stageId: stage.id,
      stageVersion: 1,
      attemptNo: 1,
      humanUserId: userId,
      storyPhase: "in_game",
      storyCursor: { frameIndex: 0, beatIndex: 0 },
      stage,
      _plan: plan,
      challenge: {
        enabled: true,
        id: challenge.id,
        difficulty: difficulty.id,
        powerId: challenge.powerId,
        powerRole: challenge.powerRole
      }
    };

    state.mode = new SinglePlayerMode();
    state.mode.initMatch(state);
    state.mode.onLobbyReady(state);

    // A challenge is a full, normal match (same as any other single-player
    // stage -- see sessionService.js's startAttempt, which sets this same
    // isTutorial: false) with exactly one AI quirk layered on top: runAI.js
    // forces state.singlePlayer.challenge.powerId whenever the AI holds
    // challenge.powerRole. No tutorial flags needed for that -- see
    // maybeUsePower's "challenge" branch.
    state.isTutorial = false;
    state.phase = "simultaneous";

    this.sessionService.sessionsByRoomId.set(roomId, {
      userId,
      stageId: stage.id,
      sessionId: state.singlePlayer.sessionId,
      attemptNo: 1,
      isChallenge: true
    });

    return {
      ok: true,
      roomId,
      challenge: { ...challenge },
      difficulty: { id: difficulty.id, label: difficulty.label }
    };
  }

  beginGameplay({ socket, userId, roomId }) {
    const room = rooms[roomId];
    const sp = room?.state?.singlePlayer;
    if (!room || !sp?.challenge?.enabled || sp.humanUserId !== userId) {
      return { ok: false, code: "CHALLENGE_SESSION_NOT_FOUND" };
    }

    room.socketToUserId ||= {};
    room.playersByUserId ||= {};
    room.socketToUserId[socket.id] = userId;
    room.playersByUserId[userId] ||= { userId, connected: true, isAI: false };
    room.playersByUserId[userId].socketId = socket.id;
    room.playersByUserId[userId].connected = true;
    socket.data ||= {};
    socket.data.roomId = roomId;
    socket.join(roomId);
    emitRoomState(roomId, room, this.context.io);
    return { ok: true, roomId };
  }

  async onMatchOver(roomId) {
    const room = rooms[roomId];
    const state = room?.state;
    const sp = state?.singlePlayer;
    if (!sp?.challenge?.enabled) return null;
    // UMT_REQUESTED_FIXES_20260901: CHALLENGE RESULT GUARD
    if (sp.storyPhase === "completed") return null;
    const result = scoreChallenge(state, sp);
    sp.storyPhase = "completed";
    return result;
  }

  async abandon({ userId, roomId }) {
    const room = rooms[roomId];
    const sp = room?.state?.singlePlayer;
    if (sp?.challenge?.enabled && sp.humanUserId !== userId) {
      return { ok: false, code: "CHALLENGE_SESSION_NOT_FOUND" };
    }
    this.sessionService.sessionsByRoomId.delete(roomId);
    if (room) room.status = "closed";
    return { ok: true };
  }
}

module.exports = { ChallengeService };
