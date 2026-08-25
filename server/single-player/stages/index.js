// server/single-player/stages/index.js
//
// The full stage list. Adding a new stage means adding one file here and
// listing it below -- stageRegistry.js validates and freezes whatever
// this array contains; nothing else needs to change.

"use strict";

module.exports = [
  require("./chapter-1-1"),
  require("./chapter-1-2")
];
