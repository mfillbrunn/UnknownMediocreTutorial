// server/single-player/index.js
//
// The campaign module's own top-level wiring, mirroring registerMatchmaking's
// shape: one function that assembles this subsystem's services and attaches
// its socket handlers, called once from server/index.js after the normal
// engine/powers/context are already set up. Nothing outside this folder
// needs to know how these pieces fit together.

"use strict";

const { ProgressRepository } = require("./progressRepository");
const { SessionService } = require("./sessionService");
const { AchievementService } = require("./achievements/service");
const { loadRegistry } = require("./stageRegistry");
const hooks = require("./hooks");
const registerSinglePlayerSocketHandlers = require("./socketHandlers");
const { ChallengeService } = require("./challenges/challengeService"); // UMT_CHALLENGES_V1
const registerChallengeSocketHandlers = require("./challenges/socketHandlers"); // UMT_CHALLENGES_V1

function registerSinglePlayer(io, context) {
  loadRegistry(context);

  const progressRepository = new ProgressRepository(context.supabase);
  const achievementService = new AchievementService(context.supabase);
  const sessionService = new SessionService({ context, progressRepository, achievementService });
  // UMT_CHALLENGES_V1: challenge matches reuse the single-player room/mode shell,
  // but keep their own catalog/results rather than campaign stage persistence.
  const challengeService = new ChallengeService({ context, progressRepository, sessionService });
  sessionService.challengeService = challengeService;

  hooks.configure({ sessionService, achievementService });

  registerSinglePlayerSocketHandlers(io, context, { sessionService });
  registerChallengeSocketHandlers(io, context, { challengeService });

  return { sessionService, challengeService, achievementService, progressRepository }; // UMT_CHALLENGES_V1
}

module.exports = { registerSinglePlayer };
