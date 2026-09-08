// Regression test: a reward card must never be OFFERED in a state where
// picking it would do nothing.
//
// rewardPickRarityOptions filters the draw through rewardOptionApplicable,
// so a card whose gate is looser than its own effect becomes a dead slot on
// the chooser's screen -- and, worse, still reports a confident result in
// the effect log.
//
// "Yellow Smudge" (spy-yellow-smudge) was the one card where those two
// disagreed. Its gate asked only whether ANY yellow clue existed, while its
// effect removes position restrictions: yellow tiles sitting in history,
// and YELLOW_NOT_AT constraints. A bare YELLOW constraint carries no
// position, so a state holding only those passed the gate with nothing to
// smudge. That state is easy to reach -- addYellow ("Yellow clue
// received", "Trade a Yellow") and rewardDemoteGreens ("Blur a Green")
// both leave exactly that footprint, and Yellow Smudge itself adds one for
// every letter it touches, so a second Yellow Smudge always used to look
// applicable and always did nothing.
//
// Also pins the neighbouring guarantee the gate is easy to break by hand:
// Yellow Smudge only ever clears YELLOW-classified tiles and never calls
// eraseLetterKnowledge, so it cannot take a green with it -- not when
// greens sit beside the yellows it smudges, and not when no yellow exists
// at all (there it is not offered in the first place).
const assert = require("assert");
const {
  applyChoice,
  optionApplicable,
  setterRewardPool,
  guesserRewardPool
} = require("../power-choice/powerChoiceServer");

function option(pool, id) {
  const found = pool.find(o => o.id === id);
  if (!found) throw new Error(`no reward option with id ${id}`);
  return found;
}

function baseState(overrides = {}) {
  return {
    setter: "S",
    guesser: "G",
    turn: "G",
    phase: "normal",
    secret: "CRANE",
    pendingGuess: "",
    guessCount: 1,
    history: [],
    extraConstraints: [],
    powers: {},
    powerChoice: {},
    activePowers: [],
    ...overrides
  };
}

// Everything a reward is able to move. powerChoice.lastResolution is
// deliberately excluded -- applyChoice always writes it, so including it
// would make every card look like it changed something.
function snapshot(state) {
  return JSON.stringify({
    history: state.history,
    extraConstraints: state.extraConstraints,
    guessCount: state.guessCount,
    eliminated: state.powerChoice?.eliminatedLetters || [],
    ruledOut: state.powerChoice?.ruledOutLetters || [],
    powers: state.powers,
    activePowers: state.activePowers
  });
}

function apply(state, opt, role) {
  const io = { to: () => ({ emit: () => {} }) };
  const choice = {
    ownerUserId: role === "setter" ? "S" : "G",
    role,
    threshold: 4,
    tier: opt.tier
  };
  const applied = applyChoice(state, opt, choice, {}, "room1", io, {}, {});
  return { applied, resolution: state.powerChoice?.lastResolution };
}

function greenTiles(state) {
  const tiles = [];
  (state.history || []).forEach((entry, entryIndex) => {
    (entry.fbGuesser || entry.fb || []).forEach((mark, index) => {
      if (String(mark).includes("🟩")) tiles.push(`${entryIndex}:${index}`);
    });
  });
  for (const constraint of state.extraConstraints || []) {
    if (String(constraint?.type || "").toUpperCase() === "GREEN") {
      tiles.push(`constraint:${constraint.letter}:${constraint.index}`);
    }
  }
  return tiles.sort();
}

// Scenarios chosen to isolate where each card's information lives.
const SCENARIOS = {
  // Yellow knowledge that carries NO position: the footprint addYellow and
  // rewardDemoteGreens leave behind.
  yellowConstraintOnly: () =>
    baseState({
      extraConstraints: [{ type: "YELLOW", letter: "R" }],
      history: [
        { guess: "MOIST", fb: ["⬛", "⬛", "⬛", "⬛", "⬛"], fbGuesser: ["⬛", "⬛", "⬛", "⬛", "⬛"] }
      ]
    }),
  // Real yellow tiles in history -- what Yellow Smudge exists for.
  yellowInHistory: () =>
    baseState({
      history: [
        { guess: "RIVAL", fb: ["🟨", "⬛", "⬛", "🟨", "⬛"], fbGuesser: ["🟨", "⬛", "⬛", "🟨", "⬛"] }
      ]
    }),
  // Greens sitting beside the yellows, in both storage forms.
  greensAndYellow: () =>
    baseState({
      history: [
        { guess: "CRANE", fb: ["🟩", "🟩", "⬛", "⬛", "⬛"], fbGuesser: ["🟩", "🟩", "⬛", "⬛", "⬛"] },
        { guess: "RIVAL", fb: ["🟨", "⬛", "⬛", "🟨", "⬛"], fbGuesser: ["🟨", "⬛", "⬛", "🟨", "⬛"] }
      ],
      extraConstraints: [{ type: "GREEN", index: 4, letter: "E" }]
    }),
  // Greens only, no yellow anywhere.
  greensOnly: () =>
    baseState({
      history: [
        { guess: "CRANE", fb: ["🟩", "🟩", "⬛", "⬛", "⬛"], fbGuesser: ["🟩", "🟩", "⬛", "⬛", "⬛"] }
      ],
      extraConstraints: [{ type: "GREEN", index: 4, letter: "E" }]
    }),
  // A demoted green: YELLOW_NOT_AT is the other form Yellow Smudge strips.
  yellowNotAt: () =>
    baseState({
      extraConstraints: [
        { type: "YELLOW", letter: "C" },
        { type: "YELLOW_NOT_AT", letter: "C", index: 0 }
      ]
    }),
  empty: () => baseState()
};

function run() {
  const setterPool = setterRewardPool();
  const guesserPool = guesserRewardPool(3);
  const smudge = option(setterPool, "spy-yellow-smudge");

  // -- 1. No fixed card may be offerable in a state where it does nothing. --
  {
    const offenders = [];
    for (const [role, pool] of [["setter", setterPool], ["guesser", guesserPool]]) {
      for (const opt of pool) {
        if (opt.kind === "power") continue;
        for (const [label, makeState] of Object.entries(SCENARIOS)) {
          const state = makeState();
          if (!optionApplicable(state, opt)) continue;
          const before = snapshot(state);
          const { resolution } = apply(state, opt, role);
          if (before === snapshot(state)) {
            offenders.push(`${role}/${opt.id} in ${label} -> "${resolution?.detailText}"`);
          }
        }
      }
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `no fixed reward may be offered where it changes nothing:\n  ${offenders.join("\n  ")}`
    );
  }

  // -- 2. Yellow Smudge is withheld when only position-free yellows exist. --
  {
    const state = SCENARIOS.yellowConstraintOnly();
    assert.strictEqual(
      optionApplicable(state, smudge),
      false,
      "Yellow Smudge must not be offered when the only yellow knowledge is a position-free YELLOW constraint"
    );
  }

  // -- 3. ...and stays withheld right after it has been used, rather than
  // re-offering itself forever on the YELLOW constraints it just added. --
  {
    const state = SCENARIOS.yellowInHistory();
    assert.strictEqual(optionApplicable(state, smudge), true, "first Yellow Smudge must be offerable");
    const { resolution } = apply(state, smudge, "setter");
    assert.deepStrictEqual(
      [...(resolution.detail.letters || [])].sort(),
      ["A", "R"],
      "both smudged letters must be reported"
    );
    assert.ok(
      state.extraConstraints.some(c => c.type === "YELLOW" && c.letter === "R"),
      "the letter must stay known-present after its tile is blanked"
    );
    assert.strictEqual(
      optionApplicable(state, smudge),
      false,
      "a second Yellow Smudge must not be offered -- every restriction is already gone"
    );
  }

  // -- 4. YELLOW_NOT_AT alone is a real target, so the card IS offered. --
  {
    const state = SCENARIOS.yellowNotAt();
    assert.strictEqual(
      optionApplicable(state, smudge),
      true,
      "a YELLOW_NOT_AT constraint is a position restriction and must keep the card offerable"
    );
    const { resolution } = apply(state, smudge, "setter");
    assert.deepStrictEqual(resolution.detail.letters, ["C"], "the demoted letter must be reported");
    assert.strictEqual(
      state.extraConstraints.some(c => String(c.type).toUpperCase() === "YELLOW_NOT_AT"),
      false,
      "the YELLOW_NOT_AT restriction must be gone"
    );
  }

  // -- 5. Greens survive a smudge, in both storage forms. --
  {
    const state = SCENARIOS.greensAndYellow();
    const before = greenTiles(state);
    assert.ok(before.length >= 2, "scenario must actually hold greens in both forms");
    apply(state, smudge, "setter");
    assert.deepStrictEqual(
      greenTiles(state),
      before,
      "Yellow Smudge must never clear a green tile or a GREEN constraint"
    );
  }

  // -- 6. With no yellow at all the card is never offered, so it can never
  // reach greens as a fallback. --
  {
    for (const label of ["greensOnly", "empty"]) {
      const state = SCENARIOS[label]();
      assert.strictEqual(
        optionApplicable(state, smudge),
        false,
        `Yellow Smudge must not be offered in ${label}`
      );
      // Belt and braces: even forced through, it takes no green.
      const before = greenTiles(state);
      apply(state, smudge, "setter");
      assert.deepStrictEqual(
        greenTiles(state),
        before,
        `forcing Yellow Smudge in ${label} must still leave greens alone`
      );
    }
  }

  console.log(
    "PASS rewardNoOpOffers: no fixed reward is offered in a state where it does nothing (Yellow Smudge now gates on real position restrictions, not on any yellow clue), and Yellow Smudge never touches greens"
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
