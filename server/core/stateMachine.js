// core/stateMachine.js

const handleLobbyPhase = require("./phases/lobby");
const handleSimultaneousPhase = require("./phases/simultaneous");
const handleNormalPhase = require("./phases/normal");
const handleGameOverPhase = require("./phases/gameOver");

function applyAction(room, state, action, role, roomId, context) {
  const { powerEngine } = context;

  switch (state.phase) {
    case "lobby":
      return handleLobbyPhase(room, state, action, role, roomId, context);

    case "simultaneous":
      return handleSimultaneousPhase(room, state, action, role, roomId, context);

    case "normal":
      return handleNormalPhase(room, state, action, role, roomId, context);

    case "gameOver":
      return handleGameOverPhase(room, state, action, role, roomId, context);

    default:
      console.warn("Unknown phase:", state.phase);
      return;
  }
}

module.exports = applyAction;
