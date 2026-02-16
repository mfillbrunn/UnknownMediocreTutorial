// core/ai/runAI.js

const { getAI } = require("./aiDifficulty");
const { applyAIAction } = require("./aiActions");
const powerMetadata = require("../../powers/powerMetadata");

const FORBIDDEN_AI_POWERS = new Set([
  "assassinWord",
  "revealHistory"
]);

function pickRandomUsablePower(state, role) {
  if (state.powerUsedThisTurn) return null;
  if (!Array.isArray(state.activePowers) || state.activePowers.length === 0) {return null;}
  const usable = state.activePowers.filter(powerId => {
    if (FORBIDDEN_AI_POWERS.has(powerId)) return false;
    const meta = powerMetadata[powerId];
    if (!meta) return false;
    return meta.role === (role === "A" ? "setter" : "guesser");
  });
  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}
function toUpperSnake(str) {return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();}

function maybeUsePower(room, state, aiPlayer, roomId, context,isTutorial) {
  if (state.powerUsedThisTurn) return false;
  if (isTutorial){
      if (aiPlayer.role === state.guesser){
         if (state.history.length === 1){
           applyAIAction(room, { type: "USE_NONSENSE" },    aiPlayer.role,    roomId,    context  );
         }
        return true;
      }
      if (aiPlayer.role === state.setter){
          if (state.history.length === 2){
           applyAIAction(room, { type: "USE_COUNT_ONLY" },    aiPlayer.role,    roomId,    context  );
         }
        return true;
      }
      return false;
  }
  if (Math.random() > 0.5) return false;
  const powerId = pickRandomUsablePower(state, aiPlayer.role);
  if (!powerId) return false;
  applyAIAction(room,    { type: `USE_${toUpperSnake(powerId)}` },    aiPlayer.role,    roomId,    context  );
  return true;
}

function asArray(words) {
  if (Array.isArray(words)) return words;
  if (words instanceof Set) return Array.from(words);
  return [];
}
const AI_PENDING = new Set();

function aiDelay({ base = 1500, variance = 1200 } = {}) {
  return Math.min(base + Math.random() * variance, 2500);
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
  // Tutorial
  const isTutorial = state.mode?.type === "tutorial" && state.history.length<=3;
  // -----------------------------
  // NORMAL PHASE
  // -----------------------------
  if (state.phase === "normal" && state.turn === aiPlayer.role) {
     if (aiPlayer.role === state.guesser && !state.pendingGuess) {
      actionFn = () => {
        maybeUsePower(room, state, aiPlayer, roomId, context, isTutorial);
        let guess = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
        if (isTutorial) {guess = state.tutorialGuessesAI[state.history.length];}
        applyAIAction(
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
              maybeUsePower(room, state, aiPlayer, roomId, context, isTutorial);
              let secret = aiLogic.pickSecret(state, context.WORDS.secrets);
              applyAIAction(
                room,
                { type: "SET_SECRET_SAME"},
                state.setter,
                roomId,
                context
              );
            };
          } else{
          actionFn = () => {
            maybeUsePower(room, state, aiPlayer, roomId, context, isTutorial);
            let secret = aiLogic.pickSecret(state, context.WORDS.secrets);
            if (isTutorial) {secret = state.tutorialSecretsAI[state.history.length];}
            applyAIAction(
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
        let guess = aiLogic.pickGuess(state, context.WORDS.guesses, context.WORDS.secrets);
        if (isTutorial) {guess = state.tutorialGuessesAI[0];}
        applyAIAction(
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
        let secret = aiLogic.pickSecret(state, context.WORDS.secrets);
        if (isTutorial) {secret =state.tutorialSecretsAI[0];}
          applyAIAction(
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
