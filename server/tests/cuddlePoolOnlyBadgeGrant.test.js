// Pool-only badges (Alphabet Compass, ...) have no case in the engine's own
// badge switch: the engine refuses them with "Unknown badge." and
// public/cuddle/cuddle-synergies.js recognises that refusal by its text and
// applies the badge itself. Rewording the engine's message once silently broke
// that (Starting Packs came out with one badge, Alphabet Compass couldn't be
// picked), so the matcher is checked against every "Unknown ..." refusal the
// engine can give.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const cuddle = path.join(__dirname, "..", "..", "public", "cuddle");
  const engine = fs.readFileSync(path.join(cuddle, "cuddle-engine.js"), "utf8");
  const synergies = fs.readFileSync(path.join(cuddle, "cuddle-synergies.js"), "utf8");

  const matcher = synergies.match(/result\.ok === false && (\/unknown [^/]+\/i)\.test\(String\(result\.error/);
  assert.ok(matcher, "cuddle-synergies.js still falls back to applying pool-only badges on an 'unknown' refusal");
  const pattern = eval(matcher[1]); // eslint-disable-line no-eval

  const refusals = [...engine.matchAll(/error: "(Unknown [^"]+)"/g)].map(match => match[1]);
  assert.ok(refusals.length > 0, "the engine still refuses ids it doesn't know with an 'Unknown ...' message");
  refusals.forEach(message => {
    assert.ok(pattern.test(message), `the pool-only fallback must recognise the engine's refusal: ${message}`);
  });
}

module.exports = { run };
