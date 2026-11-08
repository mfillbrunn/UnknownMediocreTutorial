// Cuddle's hard mode (the Hard Mode badge's bonus, and the "Hold the Clues"
// quest) keeps greens, uses yellows, and never puts a letter back in a spot
// where an earlier guess showed it yellow or grey: a tile that wasn't green
// says the answer has another letter there, even when the letter is in the
// word elsewhere (the second E of JEEPS turning grey says E isn't third).
// Both checks are plain functions inside browser scripts, so they're run in a
// small sandbox.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(file, extra) {
  const code = fs.readFileSync(path.join(__dirname, "..", "..", "public", "cuddle", file), "utf8");
  const sandbox = Object.assign({
    window: {}, document: { readyState: "loading", addEventListener() {}, querySelector() { return null; } },
    console, setTimeout, clearTimeout
  }, extra || {});
  sandbox.window.addEventListener = () => {};
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}

function row(word, shown) {
  return { word, feedback: shown, shownFeedback: shown };
}

function run() {
  // The quest's test lives in cuddle-quests.js (CuddleQuestBook.QUESTS).
  const questWindow = load("cuddle-quests.js");
  const quest = questWindow.CuddleQuestBook.QUESTS.find(item => item.id === "hardModeStreak");
  assert.ok(quest, "the Hold the Clues quest exists");
  const playsQuest = (word, history) => quest.test({ word, history, knownAbsent: [], knownPresent: [], revealedPositions: [] });

  const jeeps = row("JEEPS", ["grey", "yellow", "grey", "yellow", "yellow"]);
  const speed = row("SPEED", ["green", "green", "yellow", "grey", "yellow"]);
  assert.strictEqual(playsQuest("SPEED", [jeeps]), false, "E at 3 where JEEPS showed a grey E breaks the quest");
  assert.strictEqual(playsQuest("SPREE", [jeeps]), true, "a legal follow-up keeps the quest");
  assert.strictEqual(playsQuest("SPADE", [jeeps, speed]), true, "SPADE follows JEEPS and SPEED");

  // The badge's check: pull followsHardMode out of cuddle-strategies.js's source.
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "public", "cuddle", "cuddle-strategies.js"), "utf8");
  const start = source.indexOf("function followsHardMode(word, earlier)");
  assert.ok(start > 0, "followsHardMode is still in cuddle-strategies.js");
  const end = source.indexOf("function solvedInHardMode", start);
  const followsHardMode = vm.runInNewContext("(" + source.slice(start, end).trim() + ")");
  assert.strictEqual(followsHardMode("SPEED", [jeeps]), false, "badge: a grey tile's spot can't be reused");
  assert.strictEqual(followsHardMode("SEPAL", [jeeps]), false, "badge: a yellow tile's spot can't be reused");
  assert.strictEqual(followsHardMode("SPREE", [jeeps]), true, "badge: a legal follow-up counts");
  assert.strictEqual(followsHardMode("SPADE", [jeeps, speed]), true, "badge: SPADE follows both rows");
  const crane = row("CRANE", ["grey", "grey", "green", "grey", "yellow"]);
  assert.strictEqual(followsHardMode("TOWER", [crane]), false, "badge: a green must stay put");
  assert.strictEqual(followsHardMode("PLAAT", [crane]), false, "badge: a yellow must be used");
}

module.exports = { run };
