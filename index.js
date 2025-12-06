// index.js — Patched with Auto Roles, Switch Roles, Proper Flow, Max Players

const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

// ------------------------------
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------------------------
const io = new Server(server, {
  path: "/socket.io/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});

// ------------------------------
const { scoreGuess } = require("./game-engine/scoring.js");
const { isConsistentWithHistory } = require("./game-engine/history.js");
const { isValidWord, parseWordlist } = require("./game-engine/validation.js");
const { modifyFeedback } = require("./game-engine/modifyFeedback.js");

const { applySetterPower, applyGuesserPower } = require("./powers/applyPowers");

// --------------------------------------
let ALLOWED_GUESSES = [];
try {
  const raw = fs.readFileSync("./public/wordlists/allowed_guesses.txt", "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
} catch {
  console.log("Wordlist missing → allowing all guesses.");
}

// --------------------------------------
const rooms = {};

function createInitialState() {
  return {
    phase: "lobby",
    turn: null,
    setter: "A",
    guesser: "B",
    ready: { A: false, B: false },

    secret: "",
    pendingGuess: "",
    firstSecretSet: false,

    guessCount: 0,
    gameOver: false,

    history: [],

    powers: {
      hideTileUsed: false,
      hideTilePendingCount: 0,
      revealGreenUsed: false,
      revealGreenPos: null,
      freezeSecretUsed: false,
      freezeActive: false,
      reuseLettersUsed: false,
      reuseLettersPool: [],
      confuseColorsUsed: false,
      confuseColorsActive: false,
      countOnlyUsed: false,
      countOnlyActive: false
    }
  };
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random()*chars.length)];
  return id;
}

function emitLobby(roomId, payload) {
  io.to(roomId).emit("lobbyEvent", payload);
}

// --------------------------------------
function finalizeFeedback(state) {
  const guess = state.pendingGuess;
  const fb = scoreGuess(state.secret, guess);

  const powered = modifyFeedback(fb, state, guess);
  const fbFinal = powered.fbGuesser;

  state.history.push({
    guess,
    fb,
    fbGuesser: fbFinal,
    extraInfo: powered.extraInfo,
    finalSecret: state.secret
  });

  state.guessCount++;
  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.powers.confuseColorsActive = false;
  state.powers.countOnlyActive = false;
}

function enterNormalPhase(state, roomId) {
  finalizeFeedback(state);
  state.phase = "normal";
  state.turn = state.guesser;  // guesser's turn next
  io.to(roomId).emit("animateTurn", { type: "setterSubmitted" });
}

// --------------------------------------
function simultaneousComplete(state) {
  return state.secret && state.pendingGuess;
}

// --------------------------------------
// APPLY ACTIONS
// --------------------------------------
function applyAction(room, state, action, role, roomId) {

  // ---------------------
  // SWITCH ROLES (Lobby only)
  // ---------------------
  if (action.type === "SWITCH_ROLES") {
    if (state.phase !== "lobby") return;

    // Swap setter & guesser
    const oldSetter = state.setter;
    const oldGuesser = state.guesser;
    state.setter = oldGuesser;
    state.guesser = oldSetter;

    // Update all player roles
    for (const [sid, r] of Object.entries(room.players)) {
      room.players[sid] = (r === "A" ? "B" : "A");
    }

    emitLobby(roomId, { type: "rolesSwitched" });
    return;
  }

  // ---------------------
  // READY
  // ---------------------
  if (action.type === "PLAYER_READY") {
    const r = room.players[action.playerId];
    state.ready[r] = true;

    emitLobby(roomId, { type: "playerReady", role: r });

    // If both ready → start simultaneous phase
    if (state.ready.A && state.ready.B) {
      state.phase = "simultaneous";
      emitLobby(roomId, { type: "hideLobby" });
    }
    return;
  }

  // ---------------------
  // NEW MATCH
  // ---------------------
  if (action.type === "NEW_MATCH") {
    const fresh = createInitialState();
    Object.assign(state, fresh);
    return;
  }

  // ---------------------
  // POWERS
  // ---------------------
  if (action.type.startsWith("USE_")) {
    if (role === state.setter) applySetterPower(state, action, role, roomId, io);
    if (role === state.guesser) applyGuesserPower(state, action, role, roomId, io);
    return;
  }

  // ---------------------
  // SIMULTANEOUS PHASE (first round)
  // ---------------------
  if (state.phase === "simultaneous") {

    // Setter chooses NEW secret
    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      state.secret = w;
      state.firstSecretSet = true;

      if (simultaneousComplete(state)) {
        state.phase = "setterDecision";
      }
      return;
    }

    // Guesser submits first guess
    if (action.type === "SUBMIT_GUESS") {
      if (!state.firstSecretSet) return;

      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      state.pendingGuess = g;

      if (simultaneousComplete(state)) {
        state.phase = "setterDecision";
      }
      return;
    }

    return;
  }

  // ---------------------
  // SETTER DECISION PHASE
  // ---------------------
  if (state.phase === "setterDecision") {
    if (role !== state.setter) return;

    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      if (!isConsistentWithHistory(state.history, w)) return;
      state.secret = w;
      enterNormalPhase(state, roomId);
      return;
    }

    if (action.type === "SET_SECRET_SAME") {
      if (!isConsistentWithHistory(state.history, state.secret)) return;
      enterNormalPhase(state, roomId);
      return;
    }

    return;
  }

  // ---------------------
  // NORMAL (alternating turns)
  // ---------------------
  if (state.phase === "normal") {

    // Guesser turn
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      // Win condition
      if (g === state.secret) {
        state.history.push({
          guess: g,
          fb: ["🟩","🟩","🟩","🟩","🟩"],
          fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
          hiddenIndices: [],
          extraInfo: null,
          finalSecret: state.secret
        });
        state.phase = "gameOver";
        state.gameOver = true;
        state.turn = null;
        io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
        return;
      }

      state.pendingGuess = g;
      state.phase = "setterDecision";
      return;
    }

    // Setter turn
    if ((action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME") &&
        role === state.setter) {

      if (action.type === "SET_SECRET_NEW") {
        const w = action.secret.toLowerCase();
        if (!isValidWord(w, ALLOWED_GUESSES)) return;
        if (!isConsistentWithHistory(state.history, w)) return;

        state.secret = w;
      } else {
        if (!isConsistentWithHistory(state.history, state.secret)) return;
      }

      enterNormalPhase(state, roomId);
      return;
    }
  }
}

// --------------------------------------
// SOCKET CONNECTIONS
// --------------------------------------
io.on("connection", socket => {

  // CREATE ROOM
  socket.on("createRoom", cb => {
    let roomId;
    do roomId = generateRoomId(); while (rooms[roomId]);

    rooms[roomId] = { state: createInitialState(), players: {} };

    socket.join(roomId);
    rooms[roomId].players[socket.id] = "A";   // First player auto = A

    cb({ ok: true, roomId });
    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  // JOIN ROOM
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    if (Object.keys(room.players).length >= 2)
      return cb({ ok: false, error: "Room is full" });

    socket.join(roomId);

    // Assign role automatically
    const assignedRole = Object.values(room.players).includes("A") ? "B" : "A";
    room.players[socket.id] = assignedRole;

    cb({ ok: true, roomId });
    emitLobby(roomId, { type: "playerJoined" });

    io.to(roomId).emit("stateUpdate", room.state);
  });

  // GAME ACTION
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const playerRole = room.players[socket.id];

    // Add playerId for READY logic
    if (action.type === "PLAYER_READY") {
      action.playerId = socket.id;
    }

    applyAction(room, room.state, action, playerRole, roomId);
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      delete room.players[socket.id];
    }
  });
});

// --------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("VS Wordle server running on", PORT));
