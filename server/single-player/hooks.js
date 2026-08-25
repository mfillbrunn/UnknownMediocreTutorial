// server/single-player/hooks.js
//
// The single guarded surface every existing engine file calls into. Every
// export here returns immediately with a neutral/no-op result unless
// state.singlePlayer?.enabled === true -- that's the one invariant that
// keeps campaign code from ever touching a normal multiplayer game.
//
// sessionService/achievementService need to reach back into this module
// (async DB work triggered by a synchronous engine event), which would
// otherwise be a require() cycle with index.js -- configure() is called
// once at startup instead, after both services already exist.

"use strict";

const { runHook } = require("./rules/registry");
const { scriptedStartingSecret, scriptedOpeningGuess } = require("./aiPolicy");
const { buildPublicSinglePlayerSnapshot } = require("./publicState");

let services = { sessionService: null, achievementService: null };

function configure(next) {
  services = { ...services, ...next };
}

function isCampaign(state) {
  return !!state?.singlePlayer?.enabled;
}

// --- AI scripted openers (server/core/ai/runAI.js) ----------------------

function maybeOverrideAISecret(state) {
  if (!isCampaign(state)) return null;
  return scriptedStartingSecret(state);
}

function maybeOverrideAIGuess(state) {
  if (!isCampaign(state)) return null;
  return scriptedOpeningGuess(state);
}

// --- Feedback transform (finalizeFeedback.js, simultaneous.js) ----------

// entry: the history entry about to be pushed ({ fb, fbGuesser, ... }).
// guesserUserId: whoever just guessed this turn (state.guesser at the
// moment of scoring). Mutates entry.fb/fbGuesser in place and returns it,
// matching the shape callers already push onto state.history.
function maybeTransformFeedback(state, entry, guesserUserId) {
  if (!isCampaign(state) || !Array.isArray(entry?.fb)) return entry;

  const rules = state.singlePlayer.stage.game.rules || [];
  const ctx = { fb: entry.fb, guesserUserId, humanUserId: state.singlePlayer.humanUserId };
  const transformed = runHook("transformFeedback", rules, ctx);

  if (Array.isArray(transformed)) {
    entry.fb = transformed;
    // Real assist, not Fake Feedback's deliberate setter/guesser mismatch
    // -- both copies should agree once a rule has genuinely upgraded a
    // tile, or the setter's own history would show the pre-rule colors.
    entry.fbGuesser = [...transformed];
  }
  return entry;
}

// --- Forced starting word (simultaneous.js's two submit paths) ----------

// role: "guesser" | "setter". word: the just-submitted (uppercased) word.
// Only meaningful on the FIRST submission of a round (history.length===0
// at the point simultaneous.js calls this, before the entry is written) --
// callers only need to invoke this there, so there's no separate
// "already satisfied this round" bookkeeping to maintain.
function checkForcedStartWord(state, role, word) {
  if (!isCampaign(state)) return { ok: true };

  const startConfig = role === "guesser"
    ? state.singlePlayer.stage.game.human.guesserStart
    : state.singlePlayer.stage.game.human.setterStart;

  if (startConfig?.mode !== "forced") return { ok: true };
  if (String(word || "").toUpperCase() === String(startConfig.word).toUpperCase()) {
    return { ok: true };
  }
  return { ok: false, error: `This stage requires you to start with ${startConfig.word.toUpperCase()}.` };
}

// --- Human power-use tracking (normal.js's applyPower call site) --------

function recordPowerUse(state, powerId, userId) {
  if (!isCampaign(state)) return;
  if (userId !== state.singlePlayer.humanUserId) return; // never count the AI

  state.singlePlayer._powerUsesThisAttempt ||= {};
  state.singlePlayer._powerUsesThisAttempt[powerId] =
    (state.singlePlayer._powerUsesThisAttempt[powerId] || 0) + 1;

  services.achievementService
    ?.onPowerUsed({ userId, isCampaign: true })
    .catch(err => console.warn("[singlePlayer] achievement power-use event failed:", err?.message || err));
}

// --- Reward-offer filtering (power-choice/powerChoiceServer.js) ---------

// option: a reward option object from setterRewardPool/guesserRewardPool
// (a "power" kind option carries powerId). Non-power options (bet inputs,
// etc.) are always allowed -- only power unlocks are gated by campaign
// progress.
function isPowerRewardAllowed(state, role, option) {
  if (!isCampaign(state)) return true;
  if (option?.kind !== "power") return true;

  const policy = state.singlePlayer.stage.game.powerPolicy || {};
  if (policy.rewardsUseUnlocks === false) return true;

  const round = state.singlePlayer._plan.rounds[state.roundIndex];
  const unlockedForRole = role === "guesser" ? round.guesserPowers : round.setterPowers;
  return unlockedForRole.includes(option.powerId);
}

// --- safeState.js public snapshot ----------------------------------------

function buildSnapshot(state, userId) {
  if (!isCampaign(state)) return undefined;
  return buildPublicSinglePlayerSnapshot(state, userId);
}

// --- gameOver.js: campaign completion + multiplayer achievement event ---

// Fire-and-forget, same pattern gameOver.js already uses for
// writeMatchHistory/applyRankedElo -- scoring/persistence is async, so
// this kicks it off and returns immediately; the result reaches the
// client via a separate singlePlayer:stageResult emit once it resolves.
function onRoundEnded(state, roomId, io) {
  if (!isCampaign(state)) return;
  if (!state.mode?.isMatchOver?.(state)) return;
  if (!services.sessionService) return;

  services.sessionService
    .onStageMatchOver(roomId)
    .then(result => {
      if (result) io.to(roomId).emit("singlePlayer:stageResult", result);
    })
    .catch(err => console.warn("[singlePlayer] stage scoring failed:", err?.message || err));
}

// Called from the existing "a real, finished, non-tutorial match just
// ended" block in gameOver.js -- already the single choke point every
// real match (human-vs-human and human-vs-AI alike) resolves through.
// Guarded the other way around from everything else here: fires for
// ordinary multiplayer, explicitly skipped for campaign play.
function onMultiplayerMatchCompleted(state, room) {
  if (isCampaign(state)) return;
  if (!services.achievementService) return;

  const humanUserIds = Object.values(room?.playersByUserId || {})
    .filter(p => !p.isAI)
    .map(p => p.userId);

  for (const userId of humanUserIds) {
    services.achievementService
      .onMultiplayerMatchCompleted({ userId, matchId: state.matchId || `${room?.roomId || ""}:${Date.now()}` })
      .catch(err => console.warn("[singlePlayer] multiplayer achievement event failed:", err?.message || err));
  }
}

module.exports = {
  configure,
  maybeOverrideAISecret,
  maybeOverrideAIGuess,
  maybeTransformFeedback,
  checkForcedStartWord,
  recordPowerUse,
  isPowerRewardAllowed,
  buildSnapshot,
  onRoundEnded,
  onMultiplayerMatchCompleted
};
