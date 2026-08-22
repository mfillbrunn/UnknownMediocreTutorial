// powers/powers/letterProbeServer.js — "Letter Scan" (guesser, once per
// match). The server picks 5 distinct letters (the guesser no longer types
// them) and reveals ONLY how many of them appear in the current secret —
// just the number, no positions, no which-ones.
//
// The 5 are chosen with a bias toward actually being useful:
//   1. One guaranteed letter that IS in the secret but isn't confirmed
//      green/yellow yet (so the scan is never wasted on pure noise).
//   2. The rest drawn from every other letter whose status is still
//      genuinely unknown (not yet green, yellow, or confirmed absent) --
//      these can also happen to be in the secret, just not confirmed yet.
//   3. Only if there aren't enough unknown letters left to fill all 5 does
//      it pad with already-known green/yellow letters (never gray/absent
//      ones, which would burn a slot on something already worthless).
// "Known"/"unknown" is judged from the GUESSER's own view (fbGuesser), not
// the true feedback -- a letter a setter power (Blue Mode, Falsify Intel,
// ...) has hidden the true color of still counts as unknown to them.
//
// The result is sent privately to the guesser's own socket (popup), stashed
// on state.powers so the guesser's info badge can show it for the rest of
// the turn, and attached to the guesser's own next history entry (via
// postScore) so it's a permanent line in their action log — never the
// setter's, who only ever sees the generic public "used" line. safeState.js
// redacts both the state.powers field and the entry field for the setter.

const engine = require("../powerEngineServer");
const { buildKeyboardState } = require("../../game-engine/keyboardState");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function shuffleTake(pool, count) {
  const copy = [...pool];
  const picked = [];
  while (picked.length < count && copy.length) {
    const index = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

// buildKeyboardState reads entry.fb when present (the true, unredacted
// colors) and only falls back to entry.fbGuesser when fb is missing -- the
// shape a real client's safeState-redacted state has. Called here on the
// live, unredacted server state, entry.fb is always present, so stripping
// it first forces the guesser's own knowledge through instead of the
// secret-holder's.
function guesserKnownLetters(state) {
  const guesserView = {
    ...state,
    history: (state.history || []).map(entry => ({ ...entry, fb: undefined }))
  };
  return buildKeyboardState(guesserView).keyboard;
}

function pickSweepLetters(state) {
  const keyboard = guesserKnownLetters(state);
  const secretLetters = new Set((state.secret || "").toUpperCase().split(""));

  const isUnknown = letter => !keyboard[letter];
  const isKnownPresent = letter => keyboard[letter] === "green" || keyboard[letter] === "yellow";

  const chosen = [];

  // One guaranteed letter: in the secret, but not yet known green/yellow.
  const unknownSecretLetters = ALPHABET.filter(l => secretLetters.has(l) && isUnknown(l));
  if (unknownSecretLetters.length) {
    chosen.push(...shuffleTake(unknownSecretLetters, 1));
  }

  // Fill the rest from every other still-unknown letter (secret or not).
  const remainingUnknown = ALPHABET.filter(l => isUnknown(l) && !chosen.includes(l));
  chosen.push(...shuffleTake(remainingUnknown, 5 - chosen.length));

  // Not enough unknown letters left -- pad with already-known green/yellow
  // ones rather than wasting a slot on something confirmed absent.
  if (chosen.length < 5) {
    const knownPresent = ALPHABET.filter(l => isKnownPresent(l) && !chosen.includes(l));
    chosen.push(...shuffleTake(knownPresent, 5 - chosen.length));
  }

  // Exhausted even that (vanishingly rare, very late in a long match) --
  // fall back to whatever's left so the power always returns exactly 5.
  if (chosen.length < 5) {
    const anyLeft = ALPHABET.filter(l => !chosen.includes(l));
    chosen.push(...shuffleTake(anyLeft, 5 - chosen.length));
  }

  return chosen;
}

engine.registerPower("letterProbe", {
  apply(state, action, roomId, io, room) {
    if (state.powers.letterProbeUsed) return false;
    if (state.turn !== state.guesser) return false;
    if (!state.secret || state.secret.length !== 5) return false;

    state.powers.letterProbeUsed = true;

    const tested = pickSweepLetters(state);
    const secretLetters = new Set(state.secret.toUpperCase().split(""));
    const count = tested.filter(l => secretLetters.has(l)).length;

    const result = { letters: tested.join(""), distinctTested: tested.length, count };

    // Persisted so the guesser's info badge can show it for the rest of the
    // turn (cleared by postScore below once their next guess resolves).
    state.powers.letterProbeResult = result;

    // Public: generic "used" line for the log (no letters, no count).
    io.to(roomId).emit("powerUsed", { type: "letterProbe" });

    // Private: the actual answer, only to the guesser who used it.
    const guesserSocketId = room?.playersByUserId?.[action.userId]?.socketId;
    if (guesserSocketId) {
      io.to(guesserSocketId).emit("letterProbeResult", result);
    }
  },

  postScore(state, entry) {
    if (!state.powers.letterProbeResult) return;
    // Attaches to the guesser's own next-scored guess this round — the
    // natural pairing, since the probe can only be used once per round and
    // is always followed by that round's guess. safeState strips this for
    // the setter, so it's a guesser-only permanent log line.
    entry.letterProbeResult = state.powers.letterProbeResult;
    state.powers.letterProbeResult = null;
  }
});
