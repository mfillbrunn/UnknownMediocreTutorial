// server/single-player/sessionService.js
//
// Orchestrates a campaign attempt end to end: creates the tagged room,
// resolves the round plan (unlockService.js), starts the underlying match
// via the exact same room/mode primitives a normal match uses, tracks
// story position, and on completion scores the attempt (objectiveEngine +
// rankingEngine) and persists the result (progressRepository.js). This is
// the one place all of that gets wired together; socketHandlers.js is a
// thin translation from socket events to these methods.

"use strict";

const {
  rooms,
  createRoom,
  setPlayerRole,
  setPlayerName,
  emitRoomState
} = require("../core/rooms");
const { getStage, getAllStages } = require("./stageRegistry");
const { buildRoundPlan, resolveChosenRewardOption } = require("./unlockService");
const { buildCampaignManifest } = require("./publicState");
const { buildFacts, evaluateObjectives } = require("./objectiveEngine");
const { rankStage } = require("./rankingEngine");
const SinglePlayerMode = require("./campaignMode");

const AI_USER_ID = "AI";


function normalizedCampaignName(value, fallback) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || fallback;
}

function applyStageCast(room, stage, humanUserId, fallbackHumanName) {
  const cast = stage.cast || {};
  setPlayerName(
    room,
    humanUserId,
    normalizedCampaignName(cast.human, fallbackHumanName || "Player")
  );
  setPlayerName(
    room,
    AI_USER_ID,
    normalizedCampaignName(cast.opponent, "AI")
  );
}

function applyStageRuntimeOptions(state, stage) {
  if (stage.game?.powerChoice === false) {
    // A non-Power-Choice value keeps the campaign on the shared core game
    // engine while suppressing random reward milestones for authored stages.
    state.gameMode = "classic";
  }

  if (stage.game?.ai?.lockSetterSecret === true) {
    // genericAI already keeps the current secret after its configured change
    // budget is exhausted. Reusing that behavior avoids a campaign-only fork
    // in the shared AI runner.
    state.aiSecretChangeCount = Number.MAX_SAFE_INTEGER;

    // A cover-strength hint can otherwise replace genericAI's Keep result.
    // This is local room state and is only changed for the authored campaign.
    if (state.powers?.spyCharge) {
      state.powers.spyCharge.enabled = false;
      state.powers.spyCharge.hint = null;
      state.powers.spyCharge.lockedPowerId = null;
    }
  }
}

function normalizeStageWord(value) {
  return String(value || "").trim().toUpperCase();
}

function didHumanGuesserSolve(state, singlePlayer) {
  const rounds = Array.isArray(state.matchRounds) ? state.matchRounds : [];
  const completedRound = [...rounds]
    .reverse()
    .find(round => round?.guesser === singlePlayer.humanUserId);
  const history = Array.isArray(completedRound?.history)
    ? completedRound.history
    : Array.isArray(state.history)
      ? state.history
      : [];
  const lastGuess = normalizeStageWord(history[history.length - 1]?.guess);
  const target = normalizeStageWord(
    singlePlayer.stage.game.ai?.fixedSetterSecret ||
      completedRound?.finalSecret ||
      completedRound?.secret ||
      state.secret
  );
  return !!lastGuess && !!target && lastGuess === target;
}

class SessionService {
  constructor({ context, progressRepository, achievementService }) {
    this.context = context;
    this.repo = progressRepository;
    this.achievements = achievementService;
    // roomId -> { userId, stageId, sessionId, attemptNo }, so a socket
    // reconnecting to the same room can find its session again without a
    // DB round trip, and so the gameOver.js hook can look up which
    // session a completing room belongs to.
    this.sessionsByRoomId = new Map();
  }

  async getCampaign(userId) {
    await this.repo.ensureProfile(userId);
    const snapshot = await this.repo.getCampaignSnapshot(userId);
    if (!snapshot.ok) return snapshot;

    const manifest = buildCampaignManifest({
      stages: getAllStages(),
      unlocks: snapshot.unlocks,
      progress: snapshot.progress,
      powerUnlocks: snapshot.powerUnlocks,
      achievements: (snapshot.achievementDefinitions || []).map(def => {
        const userRow = (snapshot.userAchievements || []).find(a => a.achievement_id === def.id);
        return {
          id: def.id,
          title: def.title,
          description: def.description,
          category: def.category,
          targetValue: def.target_value,
          unit: def.unit,
          hidden: def.hidden,
          progressValue: userRow?.progress_value || 0,
          unlockedAt: userRow?.unlocked_at || null
        };
      })
    });

    return { ok: true, ...manifest, campaignFlags: snapshot.profile?.campaign_flags || {} };
  }

  async startStage({ socket, userId, userName, stageId }) {
    const stage = getStage(stageId);
    if (!stage) return { ok: false, code: "UNKNOWN_STAGE" };

    const unlocks = await this.repo.getCampaignSnapshot(userId);
    if (!unlocks.ok) return unlocks;
    const unlockedIds = new Set((unlocks.unlocks || []).map(u => u.stage_id));
    if (!unlockedIds.has(stageId)) return { ok: false, code: "STAGE_LOCKED" };

    const humanUnlockedPowers = await this.repo.getUnlockedPowersByRole(userId);

    const attempt = await this.repo.beginAttempt({ userId, stageId, stageVersion: stage.version });
    if (!attempt.ok) return attempt;

    const roomId = createRoom(socket, userId);
    const room = rooms[roomId];
    room.isSinglePlayer = true;
    this.context.applyAction(
      room,
      room.state,
      { type: "ADD_AI", userId, difficulty: stage.game.difficulty },
      roomId,
      this.context
    );

    applyStageCast(room, stage, userId, userName);

    const plan = buildRoundPlan({ stage, humanUserId: userId, aiUserId: AI_USER_ID, humanUnlockedPowers });
    const firstRound = plan.rounds[0];

    setPlayerRole(room, firstRound.setterUserId, "setter");
    setPlayerRole(room, firstRound.guesserUserId, "guesser");

    const state = room.state;
    state.timeControl = { enabled: false };
    state.isTutorial = false;
    state.ranked = false;
    state.singlePlayer = {
      enabled: true,
      sessionId: attempt.session.id,
      stageId: stage.id,
      stageVersion: stage.version,
      attemptNo: attempt.attemptNo,
      humanUserId: userId,
      storyPhase: stage.preStory ? "pre_story" : "in_game",
      stage,
      _plan: plan
    };

    state.mode = new SinglePlayerMode();
    state.mode.initMatch(state);
    state.mode.onLobbyReady(state);
    applyStageRuntimeOptions(state, stage);
    state.phase = "simultaneous";

    this.sessionsByRoomId.set(roomId, {
      userId,
      stageId,
      sessionId: attempt.session.id,
      attemptNo: attempt.attemptNo
    });

    await this.repo.saveCheckpoint({
      sessionId: attempt.session.id,
      status: state.singlePlayer.storyPhase,
      publicResult: { storyPhase: state.singlePlayer.storyPhase, frameIndex: 0, beatIndex: 0 }
    });

    emitRoomState(roomId, room, this.context.io);

    return {
      ok: true,
      roomId,
      attemptNo: attempt.attemptNo,
      stage: this._sanitizeStageForClient(stage)
    };
  }

  // The client never receives future AI words/turn scripts, story
  // branches it hasn't reached, or objective expression internals -- only
  // what it needs to render the map/details/story/game UI.
  _sanitizeStageForClient(stage) {
    return {
      id: stage.id,
      title: stage.title,
      summary: stage.summary,
      cast: stage.cast || null,
      map: stage.map,
      game: {
        roles: stage.game.roles,
        firstRole: stage.game.firstRole,
        difficulty: stage.game.difficulty,
        human: stage.game.human
      },
      objectives: (stage.objectives || []).map(o => ({ id: o.id, required: !!o.required, label: o.label || o.id })),
      preStory: stage.preStory || null,
      postStory: stage.postStory || null
    };
  }

  async resumeStage({ socket, userId, roomId }) {
    const room = rooms[roomId];
    if (!room || !room.state.singlePlayer?.enabled || room.state.singlePlayer.humanUserId !== userId) {
      return { ok: false, code: "SESSION_NOT_FOUND" };
    }
    room.socketToUserId[socket.id] = userId;
    room.playersByUserId[userId] ||= { userId, connected: true, isAI: false };
    room.playersByUserId[userId].socketId = socket.id;
    room.playersByUserId[userId].connected = true;
    socket.join(roomId);
    emitRoomState(roomId, room, this.context.io);
    return {
      ok: true,
      roomId,
      stage: this._sanitizeStageForClient(room.state.singlePlayer.stage),
      storyPhase: room.state.singlePlayer.storyPhase
    };
  }

  async storyStep({ userId, roomId, storyPhase, frameIndex, beatIndex }) {
    const room = rooms[roomId];
    if (!room?.state.singlePlayer?.enabled || room.state.singlePlayer.humanUserId !== userId) {
      return { ok: false, code: "SESSION_NOT_FOUND" };
    }
    const sp = room.state.singlePlayer;
    if (storyPhase) sp.storyPhase = storyPhase;

    await this.repo.saveCheckpoint({
      sessionId: sp.sessionId,
      status: sp.storyPhase,
      publicResult: { storyPhase: sp.storyPhase, frameIndex: frameIndex || 0, beatIndex: beatIndex || 0 }
    });

    return { ok: true, storyPhase: sp.storyPhase };
  }

  async storyChoice({ userId, roomId, choiceId, optionId }) {
    const room = rooms[roomId];
    if (!room?.state.singlePlayer?.enabled) return { ok: false, code: "SESSION_NOT_FOUND" };
    const sp = room.state.singlePlayer;
    const result = await this.repo.saveStoryChoice({
      userId,
      stageId: sp.stageId,
      choiceId,
      optionId,
      payload: { attemptNo: sp.attemptNo }
    });
    return result;
  }

  // Called from the guarded gameOver.js hook once state.mode.isMatchOver()
  // is true for a campaign room. Scores the attempt and, if the stage has
  // a choose-one reward, parks the session in "reward_choice" instead of
  // completing it outright.
  async onStageMatchOver(roomId) {
    const room = rooms[roomId];
    const state = room?.state;
    const sp = state?.singlePlayer;
    if (!sp?.enabled) return null;

    const stage = sp.stage;
    const rounds = (state.matchRounds || []).map(r => this._roundToFacts(r, sp.humanUserId));
    const campaignSnapshot = await this.repo.getCampaignSnapshot(sp.humanUserId);
    const totalCampaignStars = campaignSnapshot.ok
      ? (campaignSnapshot.profile?.total_campaign_stars || 0)
      : 0;

    const facts = buildFacts({
      rounds,
      totalCampaignStars,
      powersUsed: sp._powerUsesThisAttempt || {}
    });
    const requiredIds = (stage.objectives || []).filter(o => o.required).map(o => o.id);
    const optionalIds = (stage.objectives || []).filter(o => !o.required).map(o => o.id);
    let { requiredPassed, results } = evaluateObjectives(stage.objectives, facts);
    if (
      stage.game?.completion?.requireCorrectGuess === true &&
      !didHumanGuesserSolve(state, sp)
    ) {
      requiredPassed = false;
      results = Object.freeze({
        ...results,
        ...Object.fromEntries(requiredIds.map(id => [id, false]))
      });
    }
    const ranked = rankStage({
      ranking: stage.ranking,
      facts,
      objectiveResults: results,
      requiredPassed,
      optionalObjectiveIds: optionalIds
    });

    const recorded = await this.repo.recordAttemptResult({
      userId: sp.humanUserId,
      stageId: stage.id,
      stageVersion: stage.version,
      completed: ranked.completed,
      score: ranked.score,
      stars: ranked.stars,
      objectiveResults: results
    });

    const hasChooseOne = ranked.completed && (stage.rewards?.chooseOne || []).length > 0;
    sp.storyPhase = ranked.completed && stage.postStory
      ? "post_story"
      : hasChooseOne
        ? "reward_choice"
        : "completed";

    if (ranked.completed && !hasChooseOne) {
      await this.repo.applyStageRewardsOnce({
        userId: sp.humanUserId,
        stageId: stage.id,
        attemptNo: sp.attemptNo,
        rewards: stage.rewards
      });
    }

    await this.repo.saveCheckpoint({
      sessionId: sp.sessionId,
      status: sp.storyPhase === "completed" ? "completed" : sp.storyPhase,
      publicResult: { ...ranked, requiredIds }
    });

    if (this.achievements && ranked.completed) {
      await this.achievements.onCampaignStageCompleted({
        userId: sp.humanUserId,
        stageId: stage.id,
        campaignComplete: !!stage.rewards?.setFlags?.campaignComplete
      });
    }

    return {
      ...ranked,
      requiredIds,
      hasChooseOne,
      chooseOne: hasChooseOne ? stage.rewards.chooseOne : null,
      newBest: recorded.ok ? recorded.isNewBest : false
    };
  }

  _roundToFacts(matchRound, humanUserId) {
    const humanIsSetter = matchRound.setter === humanUserId;
    const role = humanIsSetter ? "setter" : "guesser";
    const guessCount = Number(matchRound.guessCount) || 0;
    // Campaign play always has timeControl disabled, so the only failure
    // signal a completed round can carry is a timeout loser -- which never
    // fires here. A round reaching this point (matchRounds only records
    // rounds that finished) counts as "won"; the interesting pass/fail
    // nuance comes from the stage's own objectives (guessWithin,
    // surviveTurnsAtLeast, ...), not this generic completion flag.
    const won = matchRound.timeoutLoser !== humanUserId;
    const lastEntry = matchRound.history?.[matchRound.history.length - 1];

    return {
      role,
      won,
      guessCount,
      remainingWordsAtEnd: Number.isFinite(lastEntry?.remainingAfter) ? lastEntry.remainingAfter : null,
      questsCompleted: !humanIsSetter ? Number(matchRound.questsFulfilled) || 0 : 0,
      points: humanIsSetter ? guessCount : 0,
      opponentPoints: !humanIsSetter ? guessCount : 0
    };
  }

  async chooseReward({ userId, roomId, choiceId, optionId }) {
    const room = rooms[roomId];
    const sp = room?.state.singlePlayer;
    if (!sp?.enabled || sp.humanUserId !== userId) return { ok: false, code: "SESSION_NOT_FOUND" };
    if (sp.storyPhase !== "reward_choice") return { ok: false, code: "NO_REWARD_PENDING" };

    const option = resolveChosenRewardOption(sp.stage, choiceId, optionId);
    if (!option) return { ok: false, code: "INVALID_OPTION" };

    const result = await this.repo.applyStageRewardsOnce({
      userId,
      stageId: sp.stage.id,
      attemptNo: sp.attemptNo,
      rewards: sp.stage.rewards,
      chosenOption: option
    });
    if (!result.ok) return result;

    sp.storyPhase = sp.stage.postStory ? "post_story" : "completed";
    await this.repo.saveCheckpoint({ sessionId: sp.sessionId, status: sp.storyPhase });

    return { ok: true, storyPhase: sp.storyPhase, chosen: option };
  }

  async completeStage({ userId, roomId }) {
    const room = rooms[roomId];
    const sp = room?.state.singlePlayer;
    if (!sp?.enabled || sp.humanUserId !== userId) return { ok: false, code: "SESSION_NOT_FOUND" };

    sp.storyPhase = "completed";
    await this.repo.saveCheckpoint({ sessionId: sp.sessionId, status: "completed" });
    this.sessionsByRoomId.delete(roomId);
    return { ok: true };
  }

  async abandonStage({ userId, roomId }) {
    const room = rooms[roomId];
    const sp = room?.state.singlePlayer;
    if (sp?.sessionId) await this.repo.abandonSession(sp.sessionId);
    this.sessionsByRoomId.delete(roomId);
    if (room) room.status = "closed";
    return { ok: true };
  }
}

module.exports = { SessionService, AI_USER_ID };
