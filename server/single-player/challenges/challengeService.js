// UMT_CHALLENGES_V2
"use strict";

const {
  rooms,
  createRoom,
  setPlayerRole,
  setPlayerName,
  emitRoomState
} = require("../../core/rooms");
const { buildRoundPlan } = require("../unlockService");
const SinglePlayerMode = require("../campaignMode");
const { getChallenge, getDifficulty, publicCatalog } = require("./challengeRegistry");
const { isGuestUserId } = require("../../utils/guestUsers");

const AI_USER_ID = "AI";

function makeStage(challenge, difficulty) {
  const playerStartsAs = challenge.powerRole === "setter" ? "guesser" : "setter";
  const opponentFixed = { setter: [], guesser: [] };
  opponentFixed[challenge.powerRole] = [challenge.powerId];

  return {
    id: `challenge:${challenge.id}:${difficulty.id}`,
    version: 2,
    title: challenge.title,
    summary: challenge.summary,
    cast: { human: "Player", opponent: "Challenge AI" },
    map: { label: challenge.title, x: 50, y: 50, next: [] },
    game: {
      roles: "both",
      // The human begins opposite the AI's powered role, so the challenge
      // mechanic is encountered in round one. Round two is the normal swap.
      firstRole: playerStartsAs,
      difficulty: difficulty.aiDifficulty,
      powerChoice: false,
      quests: { disabled: true },
      human: {},
      ai: {},
      powerPolicy: {
        playerUsesUnlocks: false,
        rewardsUseUnlocks: false,
        playerFixed: { setter: [], guesser: [] },
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
  return (state.matchRounds || []).find(round => {
    const humanRole = round?.setter === humanUserId
      ? "setter"
      : round?.guesser === humanUserId
        ? "guesser"
        : null;
    return humanRole === role;
  }) || null;
}

function humanSolved(round) {
  if (!round) return false;
  const history = Array.isArray(round.history) ? round.history : [];
  const lastGuess = normalizeWord(history[history.length - 1]?.guess);
  const secret = normalizeWord(round.finalSecret || round.secret);
  return Boolean(lastGuess && secret && lastGuess === secret);
}

// Builds have used several names for the Secretkeeper star score. Keep this
// tolerant so challenge scoring remains compatible with those match records.
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
    const delta = [
      entry?.setterStarsEarned,
      entry?.setterStarDelta,
      entry?.starBonus,
      entry?.setterBonus
    ].find(Number.isFinite);
    return sum + (Number.isFinite(delta) ? Number(delta) : 0);
  }, 0);
}

function evaluateSpecialGoal(goal, { humanGuessCount, setterStarCount, guesserRound }) {
  if (goal?.type === "setterStars") {
    return {
      passed: setterStarCount >= Number(goal.target || 0),
      value: `${setterStarCount} / ${Number(goal.target || 0)} stars`
    };
  }

  const target = Number(goal?.target || 4);
  return {
    passed: humanSolved(guesserRound) && humanGuessCount <= target,
    value: `${humanGuessCount || 0} / ${target} guesses`
  };
}

function scoreChallenge(state, sp) {
  const humanId = sp.humanUserId;
  const guesserRound = roundForHumanRole(state, humanId, "guesser");
  const setterRound = roundForHumanRole(state, humanId, "setter");
  const humanGuessCount = Number(guesserRound?.guessCount) || 0;
  const aiGuessCount = Number(setterRound?.guessCount) || 0;
  const setterStarCount = setterStars(setterRound);
  const margin = aiGuessCount - humanGuessCount;
  const won = humanSolved(guesserRound) && margin > 0;
  const goal = sp.challenge.specialGoal || {
    type: sp.challenge.powerRole === "setter" ? "guessLimit" : "setterStars",
    target: sp.challenge.powerRole === "setter" ? 4 : 12,
    label: sp.challenge.powerRole === "setter"
      ? "Solve the powered round in 4 guesses or fewer"
      : "Earn at least 12 Secretkeeper stars in the powered round"
  };
  const special = evaluateSpecialGoal(goal, {
    humanGuessCount,
    setterStarCount,
    guesserRound
  });

  const marginPassed = won && margin >= 3;
  const specialPassed = won && special.passed;
  const stars = won ? 1 + (marginPassed ? 1 : 0) + (specialPassed ? 1 : 0) : 0;
  const signedMargin = `${margin >= 0 ? "+" : ""}${margin}`;

  return {
    challengeResult: true,
    challengeId: sp.challenge.id,
    title: sp.challenge.title,
    difficulty: sp.challenge.difficulty,
    difficultyLabel: sp.challenge.difficultyLabel,
    powerId: sp.challenge.powerId,
    powerRole: sp.challenge.powerRole,
    powerTurns: sp.challenge.powerTurns,
    forcedUses: sp.challenge.forcedUses,
    won,
    stars,
    margin,
    humanGuessCount,
    aiGuessCount,
    setterStars: setterStarCount,
    specialPassed: special.passed,
    conditions: {
      win: won,
      margin: marginPassed,
      special: specialPassed
    },
    objectives: [
      {
        id: "win",
        label: "Beat the AI across both roles",
        passed: won,
        value: `${humanGuessCount} vs ${aiGuessCount} guesses`
      },
      {
        id: "margin",
        label: "Win by at least 3 guesses",
        passed: marginPassed,
        value: `${signedMargin} guess margin`
      },
      {
        id: "special",
        label: goal.label,
        passed: specialPassed,
        value: special.value
      }
    ]
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

    // A guest has no row in single_player_profiles to ensure -- and no
    // matching auth.users row for one to reference -- so ensureProfile
    // would only fail a write that was never meaningful for them. Star/
    // clear progress for challenges lives in the browser's own
    // localStorage regardless of account (see challenges.js's
    // loadProgress), so nothing here depends on this call succeeding.
    if (!isGuestUserId(userId)) {
      const profile = await this.repo.ensureProfile(userId);
      if (!profile.ok) return profile;
    }

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
    const plan = buildRoundPlan({
      stage,
      humanUserId: userId,
      aiUserId: AI_USER_ID,
      humanUnlockedPowers: { setter: [], guesser: [] }
    });
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
      stageVersion: 2,
      attemptNo: 1,
      humanUserId: userId,
      storyPhase: "in_game",
      storyCursor: { frameIndex: 0, beatIndex: 0 },
      stage,
      _plan: plan,
      challenge: {
        enabled: true,
        id: challenge.id,
        title: challenge.title,
        difficulty: difficulty.id,
        difficultyLabel: difficulty.label,
        aiDifficulty: difficulty.aiDifficulty,
        powerId: challenge.powerId,
        powerRole: challenge.powerRole,
        powerTurns: difficulty.powerTurns,
        forcedUses: 0,
        remainingUses: difficulty.powerTurns,
        poweredRoundIndex: 0,
        normalRoundIndex: 1,
        playerStartsAs: challenge.playerStartsAs,
        specialGoal: { ...challenge.specialGoal }
      }
    };

    state.mode = new SinglePlayerMode();
    state.mode.initMatch(state);
    state.mode.onLobbyReady(state);
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
      challenge: {
        ...challenge,
        specialGoal: { ...challenge.specialGoal }
      },
      difficulty: { ...difficulty }
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
