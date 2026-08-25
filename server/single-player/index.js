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

function registerSinglePlayer(io, context) {
  loadRegistry(context);

  const progressRepository = new ProgressRepository(context.supabase);
  const achievementService = new AchievementService(context.supabase);
  const sessionService = new SessionService({ context, progressRepository, achievementService });

  hooks.configure({ sessionService, achievementService });

  registerSinglePlayerSocketHandlers(io, context, { sessionService });

  return { sessionService, achievementService, progressRepository };
}

module.exports = { registerSinglePlayer };
