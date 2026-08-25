// Stage authoring is data, not code -- stageSchema.js is what turns a typo
// (an unknown power id, a word not in the dictionary, an unsafe asset
// path) into a startup failure instead of a runtime surprise. This
// exercises validateStage directly against a real vocabulary built from
// the project's own wordlists/power metadata, plus the two shipped
// campaign stages via the real stageRegistry.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateStage, isSafeAssetPath, isValidWord } = require("../single-player/stageSchema");
const { parseWordlist } = require("../game-engine/validation");
const { loadRegistry, getAllStages } = require("../single-player/stageRegistry");
const POWER_METADATA = require("../powers/powerMetadata");
const { QUEST_TYPES } = require("../powers/powers/questServer");

function loadRealVocabulary() {
  const secretsRaw = fs.readFileSync(path.join(__dirname, "..", "wordlists", "allowed_secrets.txt"), "utf8");
  const guessesRaw = fs.readFileSync(path.join(__dirname, "..", "wordlists", "allowed_guesses.txt"), "utf8");
  return {
    powerIds: new Set(Object.keys(POWER_METADATA)),
    questTypes: new Set(QUEST_TYPES),
    allowedSecrets: new Set(parseWordlist(secretsRaw).map(w => w.toUpperCase())),
    allowedGuesses: new Set(parseWordlist(guessesRaw).map(w => w.toUpperCase()))
  };
}

function minimalValidStage(vocabulary, overrides = {}) {
  const [aSecret] = vocabulary.allowedSecrets;
  const [aGuess] = vocabulary.allowedGuesses;
  return {
    id: "test-stage",
    version: 1,
    chapter: 1,
    order: 1,
    title: "Test Stage",
    summary: "A minimal valid stage for schema testing.",
    map: { label: "T", x: 0, y: 0, next: [] },
    prerequisites: [],
    preStory: { frames: [{ id: "f1", image: null, alt: "n/a", beats: [{ id: "b1", speaker: "X", text: "Hi", side: "left" }] }] },
    game: {
      roles: "guesser",
      firstRole: "guesser",
      difficulty: 1,
      human: {
        guesserStart: { mode: "free", word: null },
        setterStart: { mode: "prefill", word: aSecret }
      },
      ai: {
        guesserOpeningGuessesByAttempt: [aGuess],
        setterSecretsByAttempt: [aSecret],
        guesserTurnScript: [],
        setterSecretScript: []
      },
      quests: { guesserByRound: [], setterByRound: [] },
      rules: [],
      powerPolicy: { playerUsesUnlocks: true, playerFixed: { guesser: [], setter: [] }, opponentFixed: { guesser: [], setter: [] }, rewardsUseUnlocks: true }
    },
    objectives: [{ id: "win", required: true, expression: { type: "completeStage" } }],
    ranking: {
      score: { base: 100, perPointDifferential: 0, perOptionalObjective: 0, turnPenaltyPerGuess: 0 },
      bands: [{ stars: 1, expression: { type: "completeStage" } }],
      rankLabels: { "1": "Done", "0": "Not Yet" }
    },
    rewards: { unlockPowers: [], chooseOne: [], unlockStages: [], setFlags: {} },
    postStory: undefined,
    ...overrides
  };
}

function run() {
  const vocabulary = loadRealVocabulary();

  // ---- 1. A well-formed stage validates cleanly.
  const good = minimalValidStage(vocabulary);
  const goodResult = validateStage(good, vocabulary);
  assert.deepStrictEqual(goodResult.errors, [], `a well-formed stage must have no errors, got: ${JSON.stringify(goodResult.errors)}`);
  assert.strictEqual(goodResult.valid, true);

  // ---- 2. Every kind of malformed field is caught, and only those.
  const broken = minimalValidStage(vocabulary, {
    id: "broken-stage",
    version: 0, // must be >= 1
    game: {
      roles: "sorcerer", // invalid role
      firstRole: "guesser",
      difficulty: 9, // invalid difficulty
      human: {
        guesserStart: { mode: "free", word: null },
        setterStart: { mode: "prefill", word: "ZZZZZ" } // not a real dictionary word
      },
      ai: {
        guesserOpeningGuessesByAttempt: ["QQQQQ"], // not a real guess word
        setterSecretsByAttempt: [],
        guesserTurnScript: [],
        setterSecretScript: []
      },
      quests: { guesserByRound: ["not-a-real-quest"], setterByRound: [] },
      rules: [{ id: "not-a-real-rule" }],
      powerPolicy: { playerFixed: { guesser: ["not-a-real-power"], setter: [] }, opponentFixed: { guesser: [], setter: [] }, rewardsUseUnlocks: true }
    },
    objectives: [{ id: "x", required: true, expression: { type: "not-a-real-objective-type" } }]
  });
  const brokenResult = validateStage(broken, vocabulary);
  assert.strictEqual(brokenResult.valid, false, "a malformed stage must not validate");

  const errorText = brokenResult.errors.join("\n");
  assert.ok(/version must be a positive integer/.test(errorText), "must catch bad version");
  assert.ok(/roles must be one of/.test(errorText), "must catch bad roles");
  assert.ok(/difficulty must be 1, 2, or 3/.test(errorText), "must catch bad difficulty");
  assert.ok(/not a valid 5-letter dictionary word/.test(errorText), "must catch a non-dictionary forced/prefill word");
  assert.ok(/not a valid guess word/.test(errorText), "must catch a non-dictionary scripted AI guess");
  assert.ok(/unknown quest type/.test(errorText), "must catch an unknown quest type");
  assert.ok(/unknown rule id/.test(errorText), "must catch an unknown rule id");
  assert.ok(/unknown power id/.test(errorText), "must catch an unknown power id in powerPolicy");
  assert.ok(/unknown objective type/.test(errorText), "must catch an unknown objective type");

  // ---- 3. isSafeAssetPath rejects path traversal and scheme smuggling,
  // and requires the stage's own asset directory prefix.
  assert.strictEqual(isSafeAssetPath("/single-player/assets/stages/test-stage/a.webp", "test-stage"), true);
  assert.strictEqual(isSafeAssetPath("/single-player/assets/stages/OTHER/a.webp", "test-stage"), false, "must reject another stage's asset directory");
  assert.strictEqual(isSafeAssetPath("/single-player/assets/stages/test-stage/../../secret.env", "test-stage"), false, "must reject path traversal");
  assert.strictEqual(isSafeAssetPath("javascript:alert(1)", "test-stage"), false, "must reject a smuggled scheme");
  assert.strictEqual(isSafeAssetPath("https://evil.example/a.webp", "test-stage"), false, "must reject an absolute external URL");

  // A frame with an image but no alt text must fail (accessibility guard).
  const noAlt = minimalValidStage(vocabulary, {
    preStory: { frames: [{ id: "f1", image: "/single-player/assets/stages/test-stage/a.webp", beats: [{ id: "b1", speaker: "X", text: "Hi" }] }] }
  });
  const noAltResult = validateStage(noAlt, vocabulary);
  assert.ok(noAltResult.errors.some(e => /alt text is missing/.test(e)), "an image without alt text must fail validation");

  // ---- 4. isValidWord requires exactly 5 letters and dictionary membership.
  assert.strictEqual(isValidWord("APPLE", new Set(["APPLE"])), true);
  assert.strictEqual(isValidWord("apple", new Set(["APPLE"])), true, "must be case-insensitive");
  assert.strictEqual(isValidWord("APPL", new Set(["APPL"])), false, "must reject a word that isn't 5 letters");
  assert.strictEqual(isValidWord("APPLE", new Set(["OTHER"])), false, "must reject a word outside the dictionary");

  // ---- 5. Both real shipped stages load and validate through the real
  // registry, against the project's real wordlists/power metadata.
  const context = { ALLOWED_SECRETS: [...vocabulary.allowedSecrets], ALLOWED_GUESSES: [...vocabulary.allowedGuesses] };
  loadRegistry(context);
  const stageIds = getAllStages().map(s => s.id).sort();
  assert.deepStrictEqual(stageIds, ["chapter-1-1", "chapter-1-2"], "both shipped stages must load and register");

  console.log("PASS singlePlayerStageSchema: valid stages pass, every malformed field is caught, asset-path/word guards hold, and both shipped stages load cleanly");
}

module.exports = { run };

if (require.main === module) {
  run();
}
