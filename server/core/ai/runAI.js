const {handleNormalPhase} = require("../phases/normal");
const handleSimultaneousPhase = require("../phases/simultaneous");
const { getAI } = require("./aiDifficulty");
const { applyAIAction } = require("./aiActions");
const powerMetadata = require("../../powers/powerMetadata");
const {applyAction} = require("../stateMachine");

function pickRandomUsablePower(state, role) {
  if (state.powerUsedThisTurn) return null;
  if (!Array.isArray(state.activePowers) || state.activePowers.length === 0) {
    return null;
  }
  console.log("activePowers:", state.activePowers);
  const usable = state.activePowers.filter(powerId => {
    const meta = powerMetadata[powerId];
    if (!meta) return false;
    return meta.role === (role === "A" ? "setter" : "guesser");
  });
  if (!usable.length) return null;
  console.log("usable:", usable);
  return usable[Math.floor(Math.random() * usable.length)];
}
function maybeUsePower(room, state, aiPlayer, roomId, context) {
  if (state.powerUsedThisTurn) return false;
  if (Math.random() > 1) return false;
  const powerId = pickRandomUsablePower(state, aiPlayer.role);
  if (!powerId) return false;
  applyAIAction(
  applyAction,
    room,
    { type: `USE_${powerId}` },
    aiPlayer.role,
    roomId,
    context
  );
  console.log("AI USED POWER:", powerId);
  return true;
}

function asArray(words) {
  if (Array.isArray(words)) return words;
  if (words instanceof Set) return Array.from(words);
  return [];
}
const AI_PENDING = new Set();

function aiDelay({ base = 1500, variance = 1200 } = {}) {
  return Math.min(base + Math.random() * variance,1000);
}

function maybeRunAI(room, roomId, context) {
  const state = room.state;
  const aiLogic = getAI(state);
  const aiEntry = Object.entries(room.players)
    .find(([_, p]) => p.isAI);
  if (!aiEntry) return;

  const [, aiPlayer] = aiEntry;
  if (AI_PENDING.has(roomId)) return;

  let actionFn = null;

  // -----------------------------
  // NORMAL PHASE
  // -----------------------------
  if (state.phase === "normal" && state.turn === aiPlayer.role) {
     if (aiPlayer.role === state.guesser && !state.pendingGuess) {
      actionFn = () => {
        maybeUsePower(room, state, aiPlayer, roomId, context);
        const guess = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
        applyAIAction(
          applyAction,
          room,
          { type: "SUBMIT_GUESS", guess },
          state.guesser,
          roomId,
          context
        );
      };
    }

    if (aiPlayer.role === state.setter && state.pendingGuess) {
      if (state?.powers?.freezeActive) {
      actionFn = () => {
              maybeUsePower(room, state, aiPlayer, roomId, context);
              const secret = aiLogic.pickSecret(state, context.WORDS.secrets);
              applyAIAction(
                applyAction,
                room,
                { type: "SET_SECRET_SAME"},
                state.setter,
                roomId,
                context
              );
            };
          } else{
          actionFn = () => {
            maybeUsePower(room, state, aiPlayer, roomId, context);
            const secret = aiLogic.pickSecret(state, context.WORDS.secrets);
            applyAIAction(
              applyAction,
              room,
              { type: "SET_SECRET_NEW", secret },
              state.setter,
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
    if (aiPlayer.role === state.guesser && !state.simultaneousGuessSubmitted) {
      actionFn = () => {
        const guess = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
        applyAIAction(
          applyAction,
          room,
          { type: "SUBMIT_GUESS", guess },
          state.guesser,
          roomId,
          context
        );
      };
    }

    if (aiPlayer.role === state.setter && !state.simultaneousSecretSubmitted) {
      actionFn = () => {
        const secret = aiLogic.pickSecret(state, context.WORDS.secrets);
          applyAIAction(
            applyAction,
            room,
            { type: "SET_SECRET_NEW", secret },
            state.setter,
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


module.exports = {maybeRunAI};
