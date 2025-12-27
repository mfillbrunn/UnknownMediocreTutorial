// server/index.js
const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

const { createRoom, joinRoom, rooms, cleanupEmptyRooms } = require("./core/rooms");
const registerSocketHandlers = require("./network/socketHandlers");

// ------------------------------
// Load power engine + all plugin powers
// ------------------------------
const powerEngine = require("./powers/powerEngineServer");
require("./powers/powers/hideTileServer");
require("./powers/powers/confuseColorsServer");
require("./powers/powers/countOnlyServer");
require("./powers/powers/forceGuessServer");
require("./powers/powers/blindGuessServer");
require("./powers/powers/revealGreenServer");
require("./powers/powers/freezeSecretServer");
require("./powers/powers/suggestGuessServer");
require("./powers/powers/suggestSecretServer");
require("./powers/powers/forceTimerServer");
require("./powers/powers/revealHistoryServer");
require("./powers/powers/blindSpotServer");
require("./powers/powers/stealthGuessServer");
require("./powers/powers/magicModeServer.js");
require("./powers/powers/vowelRefreshServer.js");
require("./powers/powers/revealLetterServer.js");
require("./powers/powers/assassinWordServer.js");

// ------------------------------
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
// Load allowed secrets
let ALLOWED_SECRETS = [];
try {
  const secretPath = path.join(__dirname, "wordlists", "allowed_secrets.txt");
  const raw = fs.readFileSync(secretPath, "utf8");
  ALLOWED_SECRETS = parseWordlist(raw);
} catch {
  console.warn("Could not load allowed secrets. Using allowed guesses fallback.");
  ALLOWED_SECRETS = ALLOWED_GUESSES;
}

app.get("/api/allowed-secrets", (req, res) => res.json(ALLOWED_SECRETS));

app.get("/api/allowed-guesses", (req, res) => res.json(ALLOWED_GUESSES));
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);

// ------------------------------
const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
});

// Attach global engine objects so modules can use them
const context = {
  io,
  powerEngine,
  ALLOWED_GUESSES
};

// Register socket event handlers (create/join room, game actions)
registerSocketHandlers(io, context);

// Cleanup stale rooms every 10 minutes
setInterval(cleanupEmptyRooms, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("VS Wordle server running on", PORT));
