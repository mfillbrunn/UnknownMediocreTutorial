// Regression test (REFINEMENT_SPEC section 8): "Ignore/reject client-supplied
// daily configuration fields." Drives the real ADD_AI action through
// lobby.js's actual handler (not a reimplementation of its logic) with a
// spoofed action.difficulty, and asserts the server ends up using the
// date's real seeded difficulty instead -- proving a tampered client
// cannot hand-pick an easier/harder Daily Challenge opponent than every
// other player got that day.
const assert = require("assert");
const { createRoom, rooms } = require("../core/rooms");
const handleLobbyPhase = require("../core/phases/lobby");
const { getDailyConfig } = require("../utils/dailyConfig");

function run() {
  const date = "2026-08-23";
  const real = getDailyConfig(date).aiDifficulty;
  const spoofed = real === 1 ? 3 : 1;
  assert.notStrictEqual(spoofed, real, "test setup: spoofed value must actually differ from the real one");

  const io = { to: () => ({ emit: () => {} }) };
  const socket = { id: "test-socket", join: () => {} };
  const roomId = createRoom(socket, "playerA");
  const room = rooms[roomId];
  const context = { io, ALLOWED_SECRETS: ["APPLE"], ALLOWED_GUESSES: ["APPLE"] };

  handleLobbyPhase(
    room,
    room.state,
    { type: "ADD_AI", userId: "playerA", difficulty: spoofed, dailyDate: date },
    roomId,
    context
  );

  assert.strictEqual(
    room.state.aiDifficulty,
    real,
    `ADD_AI must ignore a client-supplied difficulty for a daily game and use the date's real seed (${real}), got ${room.state.aiDifficulty}`
  );

  console.log("PASS dailyAiDifficultyEnforced: spoofed client difficulty ignored, real daily seed used");
}

module.exports = { run };

if (require.main === module) {
  run();
}
