// server/single-player/rules/registry.js
//
// Explicit registry of custom stage rules. No eval, no Function
// constructor, no dynamic require of a client-supplied path -- a stage's
// `rules` array only ever references a rule by id, resolved here against
// a fixed, hand-authored set of modules.
//
// A rule module may export any of these lifecycle hooks (all optional):
//   onSessionStart(ctx, params)
//   beforeAction(ctx, params)      -> { ok: boolean, error?: string }
//   transformFeedback(ctx, params) -> string[] (new feedback array)
//   afterAction(ctx, params)
//   onTurnStart(ctx, params)
//   onRoundEnd(ctx, params)

"use strict";

const RULES = Object.freeze({
  yellowToGreen: require("./yellowToGreen")
});

const KNOWN_RULE_IDS = Object.freeze(Object.keys(RULES));

function getRule(id) {
  return RULES[id] || null;
}

// Runs every configured rule's hook of the given name against ctx, in
// stage-author order. transformFeedback hooks chain (each rule's output
// feeds the next); every other hook is fire-and-forget over the same ctx.
function runHook(hookName, rulesConfig, ctx) {
  let value = hookName === "transformFeedback" ? ctx.fb : undefined;

  for (const entry of rulesConfig || []) {
    const rule = getRule(entry.id);
    const hook = rule?.[hookName];
    if (typeof hook !== "function") continue;

    if (hookName === "transformFeedback") {
      value = hook({ ...ctx, fb: value }, entry.params);
    } else {
      hook(ctx, entry.params);
    }
  }

  return value;
}

module.exports = { getRule, runHook, KNOWN_RULE_IDS };
