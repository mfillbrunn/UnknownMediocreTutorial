// server/utils/guestUsers.js — recognising players who have no account.
//
// Signing in is optional (see public/client/guest-identity.js): a first-time
// visitor gets a persistent local identity with an id shaped "guest-<uuid>"
// and can play everything except ranked, friends, and saved stats.
//
// Those guest ids are deliberately NOT uuids, and have no matching row in
// `profiles`, so every Supabase table keyed on a real user id has to skip
// them rather than attempt a write that can only fail (a type error on the
// uuid column, or a foreign-key violation). Centralised here so each such
// call site checks the same way instead of re-deriving the prefix.

const GUEST_ID_PREFIX = "guest-";

function isGuestUserId(userId) {
  return typeof userId === "string" && userId.startsWith(GUEST_ID_PREFIX);
}

// True when any human in the room is playing without an account. Used to
// skip match-history writes: a match row names both players, so one guest
// is enough to make the row unwritable.
function roomHasGuestPlayer(room) {
  return Object.values(room?.playersByUserId || {}).some(
    player => !player?.isAI && isGuestUserId(player?.userId)
  );
}

module.exports = { GUEST_ID_PREFIX, isGuestUserId, roomHasGuestPlayer };
