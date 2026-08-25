// server/single-player/rules/yellowToGreen.js
//
// Custom stage rule: converts yellow feedback tiles to green before the
// entry is written to history and before constraints/remaining-word
// calculations are derived from it. Configuration:
//   { id: "yellowToGreen", params: { target: "opponent" | "player" | "both" } }
//
// "target" identifies whose GUESS produced the feedback being scored, not
// whose secret it's against -- a campaign round has exactly one guesser
// each turn (the human when the stage role is "guesser", the AI when it's
// "setter"), so "player"/"opponent" here means "convert only when the
// human is the one guessing" / "...when the AI is the one guessing".

"use strict";

const GREEN = "🟩";
const YELLOW = "🟨";

// ctx: { fb: string[] (feedback emoji array), guesserUserId, humanUserId }
// Returns a NEW array -- never mutates ctx.fb, so a caller that still holds
// the original reference (for logging, undo, etc.) isn't surprised.
function transformFeedback(ctx, params) {
  const target = params?.target || "opponent";
  const guesserIsHuman = ctx.guesserUserId === ctx.humanUserId;

  const applies =
    target === "both" ||
    (target === "player" && guesserIsHuman) ||
    (target === "opponent" && !guesserIsHuman);

  if (!applies || !Array.isArray(ctx.fb)) return ctx.fb;

  return ctx.fb.map(cell => (cell === YELLOW ? GREEN : cell));
}

module.exports = { transformFeedback };
