// core/ai/runAI.js

const { getAI } = require("./aiDifficulty");
const { applyAIAction } = require("./aiActions");
const powerMetadata = require("../../powers/powerMetadata");

const FORBIDDEN_AI_POWERS = new Set([
  "assassinWord",
  "revealHistory"
]);

function getAIRole(state, aiUserId) {
  return state.players?.[aiUserId]?.role ?? null;
}

function pickRandomUsablePower(state, aiRole) {
  if (state.powerUsedThisTurn) return null;
  if (!Array.isArray(state.activePowers) || state.activePowers.length === 0) {
    return null;
  }

  const usable = state.activePowers.filter((powerId) => {
    if (FORBIDDEN_AI_POWERS.has(powerId)) return false;

    const meta = powerMetadata[powerId];
    if (!meta) return false;

    return meta.role === aiRole;
  });

  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

function toUpperSnake(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

// Some guesser powers need a payload built by the AI, not just a bare
// USE_<POWER> action. Returns the full action to dispatch.
function buildPowerAction(powerId, state, context) {
  const type = `USE_${toUpperSnake(powerId)}`;

  if (powerId === "doubleGuess") {
    const aiLogic = getAI(state);
    const g1 = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
    let g2 = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
    // Ensure the two guesses differ; fall back to any other valid word.
    if (!g2 || g2 === g1) {
      const alt = (context.WORDS.guesses || []).find(
        (r) => r.word !== g1
      );
      if (alt) g2 = alt.word;
    }
    if (!g1 || !g2 || g1 === g2) return null; // can't form two distinct guesses
    return { type, guess1: g1, guess2: g2 };
  }

  if (powerId === "letterProbe") {
    // Recon Sweep tests any 5 letters — reuse a picked guess word as the probe.
    const aiLogic = getAI(state);
    const letters = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
    if (!letters || letters.length !== 5) return null;
    return { type, letters };
  }

  return { type };
}

function maybeUsePower(room, state, aiUserId, roomId, context, isTutorial) {
  const aiRole = getAIRole(state, aiUserId);
  if (!aiRole) return false;
  if (state.powerUsedThisTurn) return false;

  if (isTutorial) {
    if (aiRole === "guesser") {
      if (state.history.length === 1) {
        applyAIAction(
          room,
          { type: "USE_NONSENSE" },
          aiUserId,
          roomId,
          context
        );
      }
      return true;
    }

    if (aiRole === "setter") {
      if (state.history.length === 2) {
        applyAIAction(
          room,
          { type: "USE_COUNT_ONLY" },
          aiUserId,
          roomId,
          context
        );
      }
      return true;
    }

    return false;
  }

  if (Math.random() > 0.5) return false;

  const powerId = pickRandomUsablePower(state, aiRole);
  if (!powerId) return false;

  const powerAction = buildPowerAction(powerId, state, context);
  if (!powerAction) return false;

  applyAIAction(room, powerAction, aiUserId, roomId, context);

  return true;
}

const AI_PENDING = new Set();

function aiDelay({ base = 1500, variance = 1200 } = {}) {
  return Math.min(base + Math.random() * variance, 2500);
}

function maybeRunAI(room, roomId, context) {
  const state = room.state;
  const aiLogic = getAI(state);

  const aiPlayer = Object.values(room.playersByUserId || {}).find((p) => p.isAI);
  if (!aiPlayer) return;

  const aiUserId = aiPlayer.userId;
  const aiRole = getAIRole(state, aiUserId);

  if (!aiRole) return;
  if (AI_PENDING.has(roomId)) return;

  let actionFn = null;

  const isTutorial =
    state.isTutorial && state.history.length < state.scriptedTurns;

  // -----------------------------
  // NORMAL PHASE
  // -----------------------------
  if (state.phase === "normal" && state.turn === aiUserId) {
    if (aiRole === "guesser" && !state.pendingGuess) {
      actionFn = () => {
        maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

        // Double Tap (and any future turn-consuming guesser power) already
        // submitted the guesses and handed the turn to the setter — don't
        // also fire a normal guess on top of it.
        if (state.pendingGuess || state.turn !== aiUserId || state.gameOver) {
          return;
        }

        let guess = aiLogic.pickGuess(
          state,
          context.WORDS.guesses,
          context.WORDS.secrets
        );

        if (isTutorial) {
          guess = state.tutorialGuessesAI[state.history.length];
        }

        applyAIAction(
          room,
          { type: "SUBMIT_GUESS", guess },
          aiUserId,
          roomId,
          context
        );
      };
    }

    if (aiRole === "setter" && state.pendingGuess) {
      // simultaneousAllWrong: the opening guess missed every letter, so
      // the setter is locked into keeping that same secret this round
      // (server rejects SET_SECRET_NEW while this is set) — same as
      // freezeActive, just from a different rule.
      if (state?.powers?.freezeActive || state.simultaneousAllWrong) {
        actionFn = () => {
          maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

          applyAIAction(
            room,
            { type: "SET_SECRET_SAME" },
            aiUserId,
            roomId,
            context
          );
        };
      } else {
        actionFn = () => {
          maybeUsePower(room, state, aiUserId, roomId, context, isTutorial);

          let secret = aiLogic.pickSecret(state, context.WORDS.secrets);

          if (isTutorial) {
            secret = state.tutorialSecretsAI[state.history.length];
          }

          applyAIAction(
            room,
            { type: "SET_SECRET_NEW", secret },
            aiUserId,
            roomId,
            context
          );
        };
      }
    }
  }

  // -----------------------------
  // SIMULTANEOUS PHASE
  // -----------------------------
  if (!actionFn && state.phase === "simultaneous") {
    if (aiRole === "guesser" && !state.simultaneousGuessSubmitted) {
      actionFn = () => {
        let guess = aiLogic.pickGuess(
          state,
          context.WORDS.guesses,
          context.WORDS.secrets
        );

        if (isTutorial) {
          guess = state.tutorialGuessesAI[0];
        }

        applyAIAction(
          room,
          { type: "SUBMIT_GUESS", guess },
          aiUserId,
          roomId,
          context
        );
      };
    }

    if (aiRole === "setter" && !state.simultaneousSecretSubmitted) {
      actionFn = () => {
        let secret = aiLogic.pickSecret(state, context.WORDS.secrets);

        if (isTutorial) {
          secret = state.tutorialSecretsAI[0];
        }

        applyAIAction(
          room,
          { type: "SET_SECRET_NEW", secret },
          aiUserId,
          roomId,
          context
        );
      };
    }
  }

  if (!actionFn) return;

  AI_PENDING.add(roomId);

  setTimeout(() => {
    AI_PENDING.delete(roomId);

    if (room.state !== state) return;
    if (state.gameOver) return;

    actionFn();
  }, aiDelay());
}

module.exports = { maybeRunAI, buildPowerAction };
