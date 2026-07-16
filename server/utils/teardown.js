const { stopTimer } = require("./Timer");
const { clearForceTimer } = require("./forceTimer");
const { stopDraftTimer } = require("./draftTimer");

function stopAllRoomIntervals(roomId, room) {
  stopTimer(roomId);
  stopDraftTimer(roomId);
  try {
    if (room?.state) {
      clearForceTimer(roomId, room.state);
    }
  } catch (err) {
    console.warn("[stopAllRoomIntervals] force timer cleanup failed", err);
  }

  // If you later add AI loops, animations, etc., they go here
}

function destroyRoom(roomId, rooms, io) {
  const room = rooms[roomId];
  if (!room) return;

  // Guard against double-destroy
  if (room.status === "dead") return;
  room.status = "dead";

  console.log("[destroyRoom] destroying room:", roomId);

  // 1. Stop all timers / intervals
  stopAllRoomIntervals(roomId, room);

  // 2. Notify clients (reuse existing client logic)
  if (io) {
    io.to(roomId).emit("forceLeaveRoom");
    io.in(roomId).socketsLeave(roomId);
  }

  // 3. Final removal
  delete rooms[roomId];
}

module.exports = {
  destroyRoom,
  stopAllRoomIntervals
};
