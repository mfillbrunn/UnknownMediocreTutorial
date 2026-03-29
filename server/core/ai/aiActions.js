// core/ai/aiActions.js
const { applyAction } = require("../applyAction");
const { emitRoomState } = require("../rooms");

function applyAIAction(room, action, userId, roomId, context) {
  action.ai = true;
  action.userId = userId;

  applyAction(room, room.state, action, roomId, context);
  emitRoomState(roomId, room, context.io);
}

module.exports = { applyAIAction };
