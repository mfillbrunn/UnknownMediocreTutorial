// server/utils/dailySeedOverride.js
//
// Developer tool support: lets the Developer screen's "Reset & Rerandomize"
// button force a genuinely different Daily Challenge for today's date,
// without waiting for the calendar to roll over. Daily Challenge is
// deterministic FROM THE DATE ALONE by design (see dailyConfig.js) --
// calling getDailyConfig(date, ...) twice for the same date always
// produces the exact same challenge, on purpose, so every player gets an
// identical one. The only way to get a different challenge for the SAME
// calendar date is to change what actually seeds it -- so this module
// holds an optional per-date "salt" string that dailyConfig.js folds into
// its seed key (`${date}:${namespace}` becomes
// `${date}:${salt}:${namespace}`) when one is set. No salt (the default,
// and the state after a server restart) reproduces the original,
// unsalted challenge for that date exactly as before.
//
// In-memory and per-process on purpose: this is a dev/testing affordance,
// not a durable feature -- a server restart naturally reverts every date
// to its original, unsalted challenge, which is the right default.
const overrides = new Map(); // date -> salt string

function getDailySeedSalt(date) {
  return overrides.get(date) || "";
}

// Picks a new random salt for `date`, replacing any previous one, and
// returns it. Every getDailyConfig(date, ...) call from this point on (in
// this server process) produces a different, but still fully
// deterministic-for-everyone, configuration for that date.
function rerollDailySeed(date) {
  const salt = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  overrides.set(date, salt);
  return salt;
}

function clearDailySeedOverride(date) {
  overrides.delete(date);
}

module.exports = { getDailySeedSalt, rerollDailySeed, clearDailySeedOverride };
