const powerChoiceServer = require("../power-choice/powerChoiceServer"); // power-choice-mode-v1
const handleLobbyPhase = require("./phases/lobby");
const { handleDraftPhase } = require("./phases/draft");
const handleSimultaneousPhase = require("./phases/simultaneous");
const { handleNormalPhase } = require("./phases/normal");
const { handleGameOverPhase } = require("./phases/postGame");

function applyAction(room, state, action, roomId, context) {
  if (powerChoiceServer.handleAction(room, state, action, roomId, context)) return; // power-choice-mode-v1
  switch (state.phase) {
    case "lobby":
      handleLobbyPhase(room, state, action, roomId, context);
      break;
    case "draft":
      handleDraftPhase(room, state, action, roomId, context);
      break;
    case "simultaneous":
      handleSimultaneousPhase(room, state, action, roomId, context);
      break;
    case "normal":
      handleNormalPhase(room, state, action, roomId, context);
      break;
    case "gameOver":
      handleGameOverPhase(room, state, action, roomId, context);
      break;
    default:
      console.warn("Unknown phase:", state.phase);
  }
}

module.exports = { applyAction };
