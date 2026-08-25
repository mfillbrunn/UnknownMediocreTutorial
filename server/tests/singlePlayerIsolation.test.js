// The whole campaign feature hangs on one invariant: every hook it wires
// into the existing engine (server/single-player/hooks.js) must return a
// neutral, no-op result immediately unless state.singlePlayer?.enabled is
// exactly true. This exercises that invariant directly against a plain
// multiplayer-shaped state (no state.singlePlayer field at all), and
// separately verifies safeState.js's redaction of the real thing when a
// campaign IS active -- the raw state.singlePlayer object carries future
// AI-scripted secrets/guesses that must never reach a client unmasked.
const assert = require("assert");
const hooks = require("../single-player/hooks");
const { buildSafeStateForPlayer } = require("../utils/safeState");

function minimalMultiplayerState(overrides = {}) {
  return {
    phase: "normal",
    players: { u1: { userId: "u1", role: "guesser" }, u2: { userId: "u2", role: "setter" } },
    setter: "u2",
    guesser: "u1",
    turn: "u1",
    secret: "APPLE",
    pendingGuess: "",
    history: [],
    extraConstraints: [],
    activePowers: [],
    initialPowers: { setter: [], guesser: [] },
    powers: {},
    gameOver: false,
    roundIndex: 0,
    roundsTotal: 1,
    matchRounds: [],
    ...overrides
  };
}

function run() {
  const plainState = minimalMultiplayerState();

  // ---- 1. Every hook no-ops for a state with no state.singlePlayer field.
  assert.strictEqual(hooks.maybeOverrideAISecret(plainState), null);
  assert.strictEqual(hooks.maybeOverrideAIGuess(plainState), null);

  const entry = { fb: ["⬛", "🟨", "⬛", "⬛", "⬛"], fbGuesser: ["⬛", "🟨", "⬛", "⬛", "⬛"] };
  const untouchedEntry = hooks.maybeTransformFeedback(plainState, entry, "u1");
  assert.deepStrictEqual(untouchedEntry.fb, ["⬛", "🟨", "⬛", "⬛", "⬛"], "feedback must be untouched outside a campaign");

  const forcedCheck = hooks.checkForcedStartWord(plainState, "guesser", "CRANE");
  assert.deepStrictEqual(forcedCheck, { ok: true }, "forced-word check must always pass outside a campaign");

  // recordPowerUse must not throw even with no achievementService configured.
  assert.doesNotThrow(() => hooks.recordPowerUse(plainState, "revealGreen", "u1"));

  assert.strictEqual(hooks.isPowerRewardAllowed(plainState, "guesser", { kind: "power", powerId: "revealGreen" }), true, "reward filtering must always allow outside a campaign");

  assert.strictEqual(hooks.buildSnapshot(plainState, "u1"), undefined, "no snapshot outside a campaign");

  assert.doesNotThrow(() => hooks.onRoundEnded(plainState, "room1", { to: () => ({ emit: () => {} }) }));
  assert.doesNotThrow(() => hooks.onMultiplayerMatchCompleted(plainState, { playersByUserId: {} }));

  // ---- 2. Turning the flag ON changes behavior; a plain object with
  // enabled:false must behave exactly like it's absent.
  const disabledState = minimalMultiplayerState({ singlePlayer: { enabled: false } });
  assert.strictEqual(hooks.buildSnapshot(disabledState, "u1"), undefined);
  assert.deepStrictEqual(hooks.checkForcedStartWord(disabledState, "guesser", "CRANE"), { ok: true });

  // ---- 3. safeState.js must never leak the raw state.singlePlayer object
  // (which carries the stage's full config, including future AI-scripted
  // secrets) -- only the redacted client snapshot.
  const campaignState = minimalMultiplayerState({
    singlePlayer: {
      enabled: true,
      sessionId: "sess-1",
      stageId: "chapter-1-1",
      stageVersion: 1,
      attemptNo: 1,
      humanUserId: "u1",
      storyPhase: "in_game",
      stage: {
        id: "chapter-1-1",
        title: "First Contact",
        map: { label: "1.1" },
        objectives: [{ id: "win", required: true, label: "Win" }],
        game: {
          roles: "guesser",
          difficulty: 1,
          ai: {
            // The exact kind of forward-looking secret that must never
            // reach a browser.
            setterSecretsByAttempt: ["SECRET_FUTURE_WORD"],
            guesserOpeningGuessesByAttempt: ["FUTURE_OPEN"]
          }
        }
      },
      _plan: {
        rounds: [{ humanRole: "guesser", setterUserId: "AI", guesserUserId: "u1", setterPowers: [], guesserPowers: [] }]
      }
    }
  });

  const safeForGuesser = buildSafeStateForPlayer(campaignState, "u1", []);
  assert.ok(safeForGuesser.singlePlayer, "campaign snapshot must be present for an active campaign room");
  assert.strictEqual(safeForGuesser.singlePlayer.enabled, true);
  assert.strictEqual(safeForGuesser.singlePlayer.stageId, "chapter-1-1");

  // The raw internals must be gone entirely -- not just absent from a
  // fresh object, but actually deleted from the JSON-cloned copy.
  assert.strictEqual(safeForGuesser.singlePlayer.stage, undefined, "the raw stage config (with future AI secrets) must never reach the client");
  assert.strictEqual(safeForGuesser.singlePlayer._plan, undefined, "the precomputed round plan must never reach the client");
  assert.strictEqual(JSON.stringify(safeForGuesser).includes("SECRET_FUTURE_WORD"), false, "a future scripted secret must not appear anywhere in the serialized safe state");
  assert.strictEqual(JSON.stringify(safeForGuesser).includes("FUTURE_OPEN"), false, "a future scripted opening guess must not appear anywhere in the serialized safe state");

  // ---- 4. An ordinary multiplayer state's safe view must carry no
  // singlePlayer key at all (not even an empty one).
  const safePlain = buildSafeStateForPlayer(plainState, "u1", []);
  assert.strictEqual("singlePlayer" in safePlain, false, "an ordinary multiplayer state must not gain a singlePlayer key");

  console.log("PASS singlePlayerIsolation: every campaign hook no-ops outside state.singlePlayer.enabled, and safeState.js redacts campaign internals (never leaking future AI-scripted words) while surfacing only the client snapshot");
}

module.exports = { run };

if (require.main === module) {
  run();
}
