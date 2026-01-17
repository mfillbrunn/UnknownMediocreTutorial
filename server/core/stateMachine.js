// core/stateMachine.js

const handleLobbyPhase = require("./phases/lobby");
const handleSimultaneousPhase = require("./phases/simultaneous");
const { handleNormalPhase } = require("./phases/normal");
const {handleGameOverPhase} = require("./phases/gameOver");
const {maybeRunAI} = require("./ai/runAI");

function applyAction(room, state, action, role, roomId, context) {
  switch (state.phase) {
    case "lobby":
      handleLobbyPhase(room, state, action, role, roomId, context);
      break;

    case "simultaneous":
      handleSimultaneousPhase(room, state, action, role, roomId, context);
      break;

    case "normal":
      handleNormalPhase(room, state, action, role, roomId, context);
      break;

    case "gameOver":
      handleGameOverPhase(room, state, action, role, roomId, context);
      break;

    default:
      console.warn("Unknown phase:", state.phase);
      return;
  }

  if (room && roomId && context) {
    setTimeout(() => {
      try {
        maybeRunAI(room, roomId, context);
      } catch (err) {
        console.error("maybeRunAI crashed:", err);
      }
    }, 300);
  }
}


module.exports = applyAction;
