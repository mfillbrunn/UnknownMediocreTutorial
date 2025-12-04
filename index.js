// index.js — FINAL Railway-Safe VS Wordle Server
// Includes:
// - Metal Edge-safe WebSocket path
// - WebSocket + polling transports
// - allowEIO3 fallback
// - Role selection broadcasting
// - Double-ready start
// - Simultaneous → setterDecision → normal flow
// - Game-over support
// - Modular game engine integration

const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

// ------------------------------
// Game-engine imports
// ------------------------------
const { scoreGuess } = require("./game-engine/scoring.js");
const { isConsistentWithHistory } = require("./game-engine/history.js");
const { isValidWord, parseWordlist } = require("./game-engine/validation.js");
const { applyFeedbackPowers } = require("./game-engine/rules.js");

// ------------------------------
// Power handlers
// ------------------------------
const { applySetterPower, applyGuesserPower } = require("./powers/applyPowers");

const app = express();
const server = http.createServer(app);

// 🔥 Railway Metal-Edge SAFE Socket.IO config
const io = new Server(server, {
  path: "/socket.io/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  allowEIO3: true
});

// force proxy route to stay active
app.get("/socket.io/", (req, res) => {
  res.sendStatus(200);
});

app.use(express.static("public"));

// --------------------------------------
// Load word list
// --------------------------------------
let ALLOWED_GUESSES = [];

try {
  const raw = fs.readFileSync("./public/wordlists/allowed_guesses.txt", "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
} catch (err) {
  console.log("No word list → all guesses allowed.");
}


// --------------------------------------
// Room State
// --------------------------------------

const rooms = {};

function createInitialState() {
  return {
    phase: "lobby",
    setter: "A",
    guesser: "B",

    turn: null,
    ready: { A: false, B: false },

    secret: "",
    pendingGuess: "",
    guessCount: 0,

    history: [],
    gameOver: false,

    powers: {
      hideTileUsed: false,
      hideTilePendingCount: 0,

      revealGreenUsed: false,
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
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}


// --------------------------------------
// Finalize feedback (apply scoring/powers)
// --------------------------------------

function finalizeFeedback(state) {
  const guess = state.pendingGuess.toLowerCase();
  const fb = scoreGuess(state.secret, guess);

  const { fbGuesser, extraInfo } = applyFeedbackPowers(fb, state.powers);

  state.history.push({
    guess,
    fb,
    fbGuesser,
    hiddenIndices: [],
    extraInfo,
    finalSecret: state.secret
  });

  state.guessCount++;
  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.powers.countOnlyActive = false;
  state.powers.confuseColorsActive = false;
}


// --------------------------------------
// Setter completes feedback → enter normal
// --------------------------------------

function enterNormalPhase(state, roomId) {
  finalizeFeedback(state);
  state.phase = "normal";
  state.turn = state.guesser;

  pushTurnAnimation(roomId, "setterSubmitted");
}


// --------------------------------------
// Simultaneous submission check
// --------------------------------------

function simultaneousComplete(state) {
  return state.secret && state.pendingGuess;
}


// --------------------------------------
// APPLY ACTION
// --------------------------------------

function applyAction(state, action, role, roomId) {

  // ROLE SELECTION
  if (action.type === "SET_ROLE") {
    state.ready[role] = false;

    if (action.role === "A") {
      state.setter = "A";
      state.guesser = "B";
    } else {
      state.setter = "B";
      state.guesser = "A";
    }

    io.to(roomId).emit("stateUpdate", state);
    return;
  }

  // READY UP
  if (action.type === "PLAYER_READY") {
    state.ready[action.role] = true;

    if (state.ready.A && state.ready.B) {
      state.phase = "simultaneous";
      state.turn = null;
      state.secret = "";
      state.pendingGuess = "";
    }

    return;
  }

  // RESET MATCH
  if (action.type === "NEW_MATCH") {
    Object.assign(state, createInitialState());
    return;
  }

  // POWERS
  if (action.type.startsWith("USE_")) {
    if (role === state.setter) applySetterPower(state, action, role, roomId, io);
    else if (role === state.guesser) applyGuesserPower(state, action, role, roomId, io);
    return;
  }

  // GAME OVER
  if (state.gameOver) return;


  // --------------------------------------
  // PHASE: simultaneous
  // --------------------------------------
  if (state.phase === "simultaneous") {

    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      state.secret = w;
      if (simultaneousComplete(state)) state.phase = "setterDecision";
      return;
    }

    if (action.type === "SUBMIT_GUESS") {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      state.pendingGuess = g;
      if (simultaneousComplete(state)) state.phase = "setterDecision";
      return;
    }

    return;
  }


  // --------------------------------------
  // PHASE: setterDecision
  // --------------------------------------
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


  // --------------------------------------
  // PHASE: normal
  // --------------------------------------
  if (state.phase === "normal") {

    // Guesser guess
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      if (g === state.secret) {
        state.history.push({
          guess: g,
          fb: ["🟩","🟩","🟩","🟩","🟩"],
          fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
          hiddenIndices: [],
          extraInfo: null,
          finalSecret: state.secret
        });

        state.guessCount++;
        state.phase = "gameOver";
        state.gameOver = true;
        state.turn = null;
        return;
      }

      state.pendingGuess = g;
      state.phase = "setterDecision";
      return;
    }

    // Setter action
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

    return;
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

    rooms[roomId] = {
      state: createInitialState(),
      players: {}
    };

    socket.join(roomId);

    cb({ ok: true, roomId });
    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  // JOIN ROOM
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);
    room.players[socket.id] = null;

    cb({ ok: true, roomId });
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // GAME ACTIONS
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const role = room.players[socket.id] || null;

    if (action.type === "SET_ROLE") {
      room.players[socket.id] = action.role;
    }

    applyAction(room.state, action, role, roomId);

    io.to(roomId).emit("stateUpdate", room.state);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
      }
    }
  });
});


// --------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("VS Wordle server running on", PORT);
});
