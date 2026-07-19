// server/index.js
const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");
const { cleanupDisconnectedPlayers } = require("./core/rooms");
const { createRoom, joinRoom, rooms, cleanupEmptyRooms } = require("./core/rooms");
const registerSocketHandlers = require("./network/socketHandlers");
const { registerMatchmaking } = require("./core/matchmaking");
const { createClient } = require("@supabase/supabase-js");
const { loadWordList } = require("./utils/wordListLoader");
const { applyAction } = require("./core/stateMachine");
const { getDailyConfig } = require("./utils/dailyConfig");



const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // IMPORTANT: service role
);
const powerEngine = require("./powers/powerEngineServer");

// ------------------------------
// Node's default behavior for an uncaught exception (or unhandled promise
// rejection) is to terminate the whole process — which drops every
// connected socket.io connection at once, since it's all one process. A
// single edge case anywhere (an AI move, a power interaction, a malformed
// action) used to look like "the whole game disconnects randomly" for
// every player currently connected. Log instead of crashing so one bad
// request can't take the entire server down.
process.on("uncaughtException", err => {
  console.error("Uncaught exception (server kept running):", err);
});
process.on("unhandledRejection", err => {
  console.error("Unhandled rejection (server kept running):", err);
});

const app = express();
const server = http.createServer(app);

// Load allowed guesses on startup
const { parseWordlist } = require("./game-engine/validation");
let ALLOWED_GUESSES = [];
try {
  const allowedPath = path.join(__dirname, "wordlists", "allowed_guesses.txt");
  const raw = fs.readFileSync(allowedPath, "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
} catch {
  console.warn("Could not load allowed guesses.");
}
// Load the tagged word list first so it can supply the authoritative secret
// set. This matters for the fallback below: everything that reasons about
// "how many secrets remain" (the setter box, the guesser's Wiretap/Tap Line)
// counts over ALLOWED_SECRETS, so it must be the true secret list — never the
// full guess list, which would inflate every count with non-secret words.
const WORDS = loadWordList();

// Load allowed secrets
let ALLOWED_SECRETS = [];
try {
  const secretPath = path.join(__dirname, "wordlists", "allowed_secrets.txt");
  const raw = fs.readFileSync(secretPath, "utf8");
  ALLOWED_SECRETS = parseWordlist(raw);
} catch {
  console.warn("Could not load allowed secrets. Falling back to the isSecret-tagged words.");
  ALLOWED_SECRETS = WORDS.secrets.map((r) => r.word);
}
// Last-resort guard: never let the secret list collapse into the full guess
// list (which would make every remaining-secrets count include non-secrets).
if (!Array.isArray(ALLOWED_SECRETS) || !ALLOWED_SECRETS.length) {
  ALLOWED_SECRETS = WORDS.secrets.map((r) => r.word);
}
global.ALLOWED_SECRETS = ALLOWED_SECRETS;
app.get("/api/allowed-secrets", (req, res) => res.json(ALLOWED_SECRETS));

app.get("/api/allowed-guesses", (req, res) => res.json(ALLOWED_GUESSES));
app.get("/api/daily", (req, res) => {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  res.json(getDailyConfig(today));
});
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);

// ------------------------------
const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true,
  // The single-threaded event loop briefly stalls on heavy synchronous
  // work (notably the AI's secret-selection each turn, which scans the
  // whole word list), and mobile/flaky networks add their own latency.
  // With the default 20s ping timeout, one such hiccup — or a short
  // network blip — is enough for the connection to be declared dead,
  // dropping the player into the "rejoin" modal even though nothing is
  // actually wrong. A more generous timeout rides out those transients;
  // genuinely-gone connections still get cleaned up, just a bit later.
  pingInterval: 25000,
  pingTimeout: 60000
});

// Attach global engine objects so modules can use them
const context = {
  io,
  supabase,
  powerEngine,
  ALLOWED_GUESSES,
  ALLOWED_SECRETS,
  WORDS,
  applyAction
};
context.endGame = require("./core/phases/gameOver").endGame;
context.transitionAfterGuess = require("./core/transitions/normalTransitions").transitionAfterGuess;
context.transitionAfterSecret = require("./core/transitions/normalTransitions").transitionAfterSecret;
context.maybeRunAI = require("./core/ai/runAI").maybeRunAI;
// ------------------------------
// Load power engine + all plugin powers
// ------------------------------

require("./powers/powers/hideTileServer");
require("./powers/powers/confuseColorsServer");
require("./powers/powers/countOnlyServer");
require("./powers/powers/forceGuessServer");
require("./powers/powers/blindGuessServer");
require("./powers/powers/revealGreenServer");
require("./powers/powers/freezeSecretServer");
require("./powers/powers/rouletteSecretServer");
require("./powers/powers/suggestGuessServer");
require("./powers/powers/suggestSecretServer");
require("./powers/powers/fakeFeedbackServer");
require("./powers/powers/forceTimerServer");
require("./powers/powers/revealHistoryServer");
require("./powers/powers/blindSpotServer");
require("./powers/powers/stealthGuessServer");
require("./powers/powers/magicModeServer.js");
require("./powers/powers/vowelRefreshServer.js");
require("./powers/powers/nonsenseServer.js");
require("./powers/powers/revealLetterServer.js");
require("./powers/powers/assassinWordServer.js");
require("./powers/powers/betMissServer.js");
require("./powers/powers/revealPenaltyServer.js");
require("./powers/powers/fieldReportServer.js");
require("./powers/powers/letterProbeServer.js");
require("./powers/powers/revealLocationServer.js");
require("./powers/powers/wiretapServer.js");
require("./powers/powers/letterProfileServer.js");
require("./powers/powers/letterLockoutServer.js");
// Register socket event handlers (create/join room, game actions)
registerSocketHandlers(io, context);
registerMatchmaking(io, context);

// Cleanup stale rooms every 10 minutes
setInterval(() => cleanupEmptyRooms(), 10 * 60 * 1000);
// Cleanup disconnected players after a 30-second grace window (matches the
// client's rejoin-or-leave prompt, which offers to reconnect within the
// same window).
setInterval(() => cleanupDisconnectedPlayers(io, 30_000), 5_000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Vowel Play server running on", PORT));
