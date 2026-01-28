// core/ai/aiActions.js
const { emitStateForAllPlayers } = require("../../utils/emitState");

function applyAIAction(applyAction, room, action, role, roomId, context) {
  action.ai = true;
  action.role = role;

  applyAction(room, room.state, action, role, roomId, context);
  emitStateForAllPlayers(roomId, room, context.io);
}

module.exports = { applyAIAction };
