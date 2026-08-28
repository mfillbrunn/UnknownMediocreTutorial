// Regression test: AI difficulty is the one part of a Daily Challenge the
// PLAYER picks (the difficulty button on the daily challenge screen, see
// daily-challenge.js's _startDailyGame) -- unlike role order/opening
// words/quests/rewards, which stay fully server-authoritative from the
// date alone. Drives the real ADD_AI action through lobby.js's actual
// handler (not a reimplementation of its logic) and asserts: a valid
// client-chosen difficulty is honored even when it differs from the day's
// own seeded default, while an invalid/missing one falls back to that
// default instead of crashing or defaulting to something arbitrary.
const assert = require("assert");
const { createRoom, rooms } = require("../core/rooms");
const handleLobbyPhase = require("../core/phases/lobby");
const { getDailyConfig } = require("../utils/dailyConfig");

function run() {
  const date = "2026-08-23";
  const seeded = getDailyConfig(date).aiDifficulty;
  const chosen = seeded === 1 ? 3 : 1;
  assert.notStrictEqual(chosen, seeded, "test setup: chosen value must actually differ from the day's seeded default");

  const io = { to: () => ({ emit: () => {} }) };
  const context = { io, ALLOWED_SECRETS: ["APPLE"], ALLOWED_GUESSES: ["APPLE"] };

  // A valid player-chosen difficulty is honored, even though it differs
  // from the day's seeded default.
  {
    const socket = { id: "test-socket-1", join: () => {} };
    const roomId = createRoom(socket, "playerA");
    const room = rooms[roomId];

    handleLobbyPhase(
      room,
      room.state,
      { type: "ADD_AI", userId: "playerA", difficulty: chosen, dailyDate: date },
      roomId,
      context
    );

    assert.strictEqual(
      room.state.aiDifficulty,
      chosen,
      `ADD_AI must honor a valid player-chosen difficulty for a daily game, got ${room.state.aiDifficulty}`
    );
  }

  // An invalid difficulty (out of range) falls back to the day's own
  // seeded default rather than being trusted verbatim or crashing.
  {
    const socket = { id: "test-socket-2", join: () => {} };
    const roomId = createRoom(socket, "playerB");
    const room = rooms[roomId];

    handleLobbyPhase(
      room,
      room.state,
      { type: "ADD_AI", userId: "playerB", difficulty: 99, dailyDate: date },
      roomId,
      context
    );

    assert.strictEqual(
      room.state.aiDifficulty,
      seeded,
      `ADD_AI must fall back to the day's seeded default for an invalid difficulty, got ${room.state.aiDifficulty}`
    );
  }

  // A missing difficulty also falls back to the day's own seeded default.
  {
    const socket = { id: "test-socket-3", join: () => {} };
    const roomId = createRoom(socket, "playerC");
    const room = rooms[roomId];

    handleLobbyPhase(
      room,
      room.state,
      { type: "ADD_AI", userId: "playerC", dailyDate: date },
      roomId,
      context
    );

    assert.strictEqual(
      room.state.aiDifficulty,
      seeded,
      `ADD_AI must fall back to the day's seeded default when no difficulty is supplied, got ${room.state.aiDifficulty}`
    );
  }

  console.log("PASS dailyAiDifficultyChoosable: a valid player-chosen difficulty is honored for daily games, an invalid/missing one falls back to the day's seeded default");
}

module.exports = { run };

if (require.main === module) {
  run();
}
