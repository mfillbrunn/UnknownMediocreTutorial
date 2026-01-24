const { stopTimer } = require("./Timer");
const { clearForceTimer } = require("../core/phases/normal");

function stopAllRoomIntervals(roomId, room) {
  stopTimer(roomId);
  try {
    if (room?.state) {
      clearForceTimer(roomId, room.state);
    }
  } catch (err) {
    console.warn("[stopAllRoomIntervals] force timer cleanup failed", err);
  }

  // If you later add AI loops, animations, etc., they go here
}

module.exports = {
  stopAllRoomIntervals
};
