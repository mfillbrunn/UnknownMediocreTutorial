const {handleNormalPhase} = require("../phases/normal");
const handleSimultaneousPhase = require("../phases/simultaneous");
const { getAI } = require("./aiDifficulty");

function asArray(words) {
  if (Array.isArray(words)) return words;
  if (words instanceof Set) return Array.from(words);
  return [];
}

const AI_PENDING = new Set();

function aiDelay({ base = 800, variance = 1200 } = {}) {
  return base + Math.random() * variance;
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
        const guess = aiLogic.pickGuess(state, context.WORDS.guesses);
        handleNormalPhase(
          room,
          state,
          { type: "SUBMIT_GUESS", guess, ai: true },
          state.guesser,
          roomId,
          context
        );
      };
    }

    if (aiPlayer.role === state.setter && state.pendingGuess) {
      actionFn = () => {
        const secret = aiLogic.pickSecret(state, context.WORDS.secrets);
        handleNormalPhase(
          room,
          state,
           { type: "SET_SECRET_NEW", secret, ai: true },
          state.setter,
          roomId,
          context
        );
      };
    }
  }

  // -----------------------------
  // SIMULTANEOUS PHASE
  // -----------------------------
  if (state.phase === "simultaneous") {
    if (aiPlayer.role === state.guesser && !state.simultaneousGuessSubmitted) {
      actionFn = () => {
        const guess = aiLogic.pickGuess(state, context.WORDS.guesses);
        handleSimultaneousPhase(
          room,
          state,
          { type: "SUBMIT_GUESS", guess, ai: true },
          state.guesser,
          roomId,
          context
        );
      };
    }

    if (aiPlayer.role === state.setter && !state.simultaneousSecretSubmitted) {
      actionFn = () => {
        const secret = aiLogic.pickSecret(state, context.WORDS.secrets);
        handleSimultaneousPhase(
          room,
          state,
          { type: "SET_SECRET_NEW", secret, ai: true },
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
