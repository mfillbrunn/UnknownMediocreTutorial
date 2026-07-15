// core/dailyTracking.js
//
// Tracks, per user and per calendar date, whether they've already started
// or finished today's Daily Challenge — in memory only (there's no
// persistent store, e.g. a Supabase column, wired up for this yet, so it
// resets on server restart; good enough for a same-day "already played"
// check).

const activeRooms = new Map();   // "<userId>:<date>" -> roomId, not finished yet
const completions = new Map();   // "<userId>:<date>" -> true, match is over

function key(userId, date) {
  return `${userId}:${date}`;
}

function markDailyStarted(userId, date, roomId) {
  if (!userId || !date || !roomId) return;
  activeRooms.set(key(userId, date), roomId);
}

function markDailyCompleted(userId, date) {
  if (!userId || !date) return;
  completions.set(key(userId, date), true);
  activeRooms.delete(key(userId, date));
}

function getDailyStatus(userId, date) {
  if (!userId || !date) return { status: "none" };

  if (completions.has(key(userId, date))) {
    return { status: "completed" };
  }

  const roomId = activeRooms.get(key(userId, date));
  if (roomId) {
    return { status: "in-progress", roomId };
  }

  return { status: "none" };
}

module.exports = { markDailyStarted, markDailyCompleted, getDailyStatus };
