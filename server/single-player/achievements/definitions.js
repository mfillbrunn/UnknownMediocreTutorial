// server/single-player/achievements/definitions.js
//
// Maps a counter key (server/single-player/achievements/service.js's unit
// of progress) to the achievement id it drives. The ids and counterKeys
// here must match the rows seeded by the migration
// (supabase/migrations/202608250001_single_player_campaign.sql) exactly --
// this is just the code-side half of that same mapping, kept local so a
// counter bump can resolve its achievement without a DB round trip.

"use strict";

const COUNTER_ACHIEVEMENTS = Object.freeze({
  campaigns_completed: "campaign_complete",
  multiplayer_matches_completed: "multiplayer_10_games",
  powers_used: "use_20_powers"
});

module.exports = { COUNTER_ACHIEVEMENTS };
