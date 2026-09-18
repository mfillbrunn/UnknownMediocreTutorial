// Regression test: Falsify Intel (fakeFeedback) shows the guesser two rows,
// one true and one fake, and NEITHER may be obviously wrong. The fake used to
// be free to recolor any tile the old "known" whitelist didn't cover, so it
// could hand back a row that contradicted what earlier rows already proved:
// a letter shown gray after it had been confirmed present, a green claimed on
// a slot the guesser had already watched a different letter land green on, or
// a second green for a letter already pinned green elsewhere with no evidence
// the word holds it twice.
//
// Checks the three per-letter rules the fake must obey against the guesser's
// existing knowledge -- gray stays gray, a proven letter never vanishes, a
// pinned green stays put -- first on hand-built situations that each isolate
// one rule, then across a randomized sweep over the real word list.
const assert = require("assert");
const engine = require("../powers/powerEngineServer.js");
require("../powers/powers/fakeFeedbackServer.js");
const { scoreGuess } = require("../game-engine/scoring");
const { loadWordList } = require("../utils/wordListLoader.js");

const power = engine.powers.fakeFeedback;

function fakeFor(secret, pastGuesses, guess) {
  const history = pastGuesses.map((g, roundIndex) => {
    const fb = scoreGuess(secret, g);
    return { guess: g, fb, fbGuesser: [...fb], roundIndex };
  });
  const state = {
    secret,
    pendingGuess: guess,
    history,
    extraConstraints: [],
    powers: { fakeFeedbackUsed: false, fakeFeedbackActive: true }
  };
  const entry = { guess, fb: scoreGuess(secret, guess), fbGuesser: scoreGuess(secret, guess) };
  power.postScore(state, entry);
  return { history, ...entry.fakeFeedback };
}

// What the guesser can prove from the rows they've already been shown.
function knowledge(history) {
  const absent = new Set();
  const present = new Set();
  const greenAt = {};
  const doubled = new Set();
  for (const row of history) {
    const inRow = new Set();
    const count = {};
    for (let i = 0; i < 5; i++) {
      if (row.fb[i] === "🟩" || row.fb[i] === "🟨") {
        inRow.add(row.guess[i]);
        count[row.guess[i]] = (count[row.guess[i]] || 0) + 1;
      }
      if (row.fb[i] === "🟩") greenAt[i] = row.guess[i];
    }
    for (const letter of Object.keys(count)) if (count[letter] >= 2) doubled.add(letter);
    for (let i = 0; i < 5; i++) {
      if (inRow.has(row.guess[i])) present.add(row.guess[i]);
      else if (row.fb[i] === "⬛") absent.add(row.guess[i]);
    }
  }
  for (const letter of present) absent.delete(letter);
  return { absent, present, greenAt, doubled };
}

// Contradictions between one feedback row and that knowledge.
function contradictions(k, guess, row) {
  const out = [];
  const nonGray = new Set();
  for (let i = 0; i < 5; i++) if (row[i] !== "⬛") nonGray.add(guess[i]);
  const greensByLetter = {};
  for (let i = 0; i < 5; i++) if (row[i] === "🟩") (greensByLetter[guess[i]] ||= []).push(i);

  for (let i = 0; i < 5; i++) {
    const letter = guess[i];
    if (k.absent.has(letter) && row[i] !== "⬛") out.push(`pos${i} ${letter}: proven absent, shown ${row[i]}`);
    if (k.present.has(letter) && !nonGray.has(letter)) out.push(`${letter}: proven present, gray everywhere`);
    if (k.greenAt[i] === letter && row[i] !== "🟩") out.push(`pos${i} ${letter}: proven green here, shown ${row[i]}`);
    if (row[i] !== "🟩") continue;
    if (k.greenAt[i] && k.greenAt[i] !== letter) out.push(`pos${i} ${letter}: ${k.greenAt[i]} is proven green here`);
    if (k.doubled.has(letter)) continue;
    for (const j of Object.keys(k.greenAt)) {
      if (Number(j) !== i && k.greenAt[j] === letter) out.push(`pos${i} ${letter}: already green at ${j}`);
    }
  }
  for (const letter of Object.keys(greensByLetter)) {
    if (greensByLetter[letter].length >= 2 && !k.doubled.has(letter)) out.push(`${letter}: two greens claimed`);
  }
  return out;
}

// Duplicate letters let the TRUE row legitimately trip some of the checks
// above (one copy of a present letter really is gray), so the fake is only
// faulted for contradictions the truth doesn't also produce.
function fakeOnlyContradictions(history, guess, trueFb, fake) {
  const k = knowledge(history);
  const baseline = new Set(contradictions(k, guess, trueFb));
  return contradictions(k, guess, fake).filter(c => !baseline.has(c));
}

function runFixedCases() {
  // A gray letter stays gray. BLIMP and GUSTO between them prove every letter
  // of PLUMB absent from CRANE, so a fake claiming any of them is present
  // reads as broken on sight.
  for (let t = 0; t < 200; t++) {
    const { entry2 } = fakeFor("CRANE", ["BLIMP", "GUSTO"], "PLUMB");
    assert.deepStrictEqual(
      entry2, ["⬛", "⬛", "⬛", "⬛", "⬛"],
      "a guess made entirely of letters proven absent cannot be faked into showing any color"
    );
  }

  // A letter proven green at a position stays green there, and never vanishes
  // elsewhere: SLATE against CRANE puts E green at index 4, so ERASE's two Es
  // may not both read gray and the trailing one may not move at all.
  for (let t = 0; t < 200; t++) {
    const { entry2 } = fakeFor("CRANE", ["SLATE"], "ERASE");
    assert.strictEqual(
      entry2[4], "🟩",
      `E was green at this exact position last round, so it stays green (got ${entry2.join("")})`
    );
    assert.ok(
      entry2[0] !== "⬛" || entry2[4] !== "⬛",
      `E is proven present, so the fake must keep at least one E non-gray (got ${entry2.join("")})`
    );
  }

  // A pinned green stays pinned. SLATE vs CRANE puts A green at index 2 and E
  // green at index 4; ALARM's A at index 0 must not be faked green (A lives at
  // index 2) and index 2 must not turn green for a different letter.
  for (let t = 0; t < 400; t++) {
    const { history, entry1, entry2 } = fakeFor("SLATE", ["CRANE"], "ALARM");
    assert.deepStrictEqual(
      fakeOnlyContradictions(history, "ALARM", entry1, entry2), [],
      `fake ${entry2.join("")} contradicts the A/E greens CRANE already revealed`
    );
  }
}

function runSweep() {
  const words = loadWordList()
    .secrets.map(row => row.word)
    .filter(word => /^[A-Z]{5}$/.test(word));
  assert.ok(words.length > 500, "sanity: the word list loaded");

  const pick = () => words[Math.floor(Math.random() * words.length)];
  let checked = 0;
  let lied = 0;

  for (let t = 0; t < 4000; t++) {
    const secret = pick();
    const past = [];
    for (let r = 0; r < 1 + Math.floor(Math.random() * 4); r++) {
      const g = pick();
      if (g !== secret && !past.includes(g)) past.push(g);
    }
    const guess = pick();
    if (!past.length || guess === secret || past.includes(guess)) continue;

    const { history, entry1, entry2 } = fakeFor(secret, past, guess);
    checked++;
    if (entry1.join("") !== entry2.join("")) lied++;

    const bad = fakeOnlyContradictions(history, guess, entry1, entry2);
    assert.deepStrictEqual(
      bad, [],
      `secret=${secret} past=${past.join(",")} guess=${guess}\n` +
      `  true ${entry1.join("")}\n  fake ${entry2.join("")}\n  ${bad.join("\n  ")}`
    );
  }

  assert.ok(checked > 1000, `sanity: the sweep ran (checked ${checked})`);
  // The constraints must not gag the power: when it can lie without
  // contradicting anything, it still does, on the overwhelming majority of
  // activations. Falling back to the truth is the rare, honest failure mode.
  assert.ok(
    lied / checked > 0.85,
    `the power still lies on nearly every activation (lied on ${lied} of ${checked})`
  );
  return { checked, lied };
}

function run() {
  runFixedCases();
  const { checked, lied } = runSweep();
  console.log(
    `PASS fakeFeedbackConsistency: Falsify Intel's fake row never contradicts revealed feedback ` +
    `(${checked} randomized situations, lied on ${lied})`
  );
}

module.exports = { run };

if (require.main === module) {
  run();
}
