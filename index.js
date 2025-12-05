// index.js — Updated for Railway Full Deployment (Frontend + Backend)

const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

// ------------------------------
// Serve FRONTEND (important!)
// ------------------------------
const app = express();
const server = http.createServer(app);

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Fallback: any unknown route returns index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------------------------
// Socket.IO Config (Railway safe)
// ------------------------------
const io = new Server(server, {
  path: "/socket.io/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// ------------------------------
// Game-engine imports
// ------------------------------
const { scoreGuess } = require("./game-engine/scoring.js");
const { isConsistentWithHistory } = require("./game-engine/history.js");
const { isValidWord, parseWordlist } = require("./game-engine/validation.js");
const { modifyFeedback } = require("./game-engine/modifyFeedback.js");

// Power handlers
const {
  applySetterPower,
  applyGuesserPower
} = require("./powers/applyPowers");

// --------------------------------------
// WORD LIST
// --------------------------------------
let ALLOWED_GUESSES = [];
try {
  const raw = fs.readFileSync("./public/wordlists/allowed_guesses.txt", "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
} catch (err) {
  console.log("Wordlist missing → allowing all guesses.");
}

// --------------------------------------
// ROOM STATE
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
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}

function emitLobby(roomId, payload) {
  io.to(roomId).emit("lobbyEvent", payload);
}

// --------------------------------------
// FEEDBACK
// --------------------------------------
function finalizeFeedback(state) {
  const guess = state.pendingGuess.toLowerCase();
  const fb = scoreGuess(state.secret, guess);

  const powered = modifyFeedback(fb, state, guess);
  const fbFinal = powered.fbGuesser;
  const extraInfo = powered.extraInfo;

  state.history.push({
    guess,
    fb,
    fbGuesser: fbFinal,
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

function enterNormalPhase(state, roomId) {
  finalizeFeedback(state);
  state.phase = "normal";
  state.turn = state.guesser;
  pushTurnAnimation(roomId, "setterSubmitted");
}

function simultaneousComplete(state) {
  return state.secret && state.pendingGuess;
}

// --------------------------------------
// APPLY ACTION
// --------------------------------------
function applyAction(state, action, role, roomId) {

  if (action.type === "SET_ROLE") {
    state.ready.A = false;
    state.ready.B = false;
    if (action.role === "A") {
      state.setter = "A"; state.guesser = "B";
    } else {
      state.setter = "B"; state.guesser = "A";
    }
    emitLobby(roomId, { type: "rolePicked", role: action.role });
    return;
  }

  if (action.type === "PLAYER_READY") {
    state.ready[action.role] = true;
    emitLobby(roomId, { type: "playerReady", role: action.role });
    if (state.ready.A && state.ready.B) {
      state.phase = "simultaneous";
      state.turn = null;
      state.secret = "";
      state.pendingGuess = "";
    }
    return;
  }

  if (action.type === "NEW_MATCH") {
    Object.assign(state, createInitialState());
    return;
  }

  if (action.type.startsWith("USE_")) {
    if (role === state.setter) applySetterPower(state, action, role, roomId, io);
    if (role === state.guesser) applyGuesserPower(state, action, role, roomId, io);
    return;
  }

  if (state.gameOver) return;

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

  if (state.phase === "normal") {
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
        state.phase = "gameOver";
        state.gameOver = true;
        state.turn = null;
        state.guessCount++;
        pushTurnAnimation(roomId, "guesserSubmitted");
        return;
      }

      state.pendingGuess = g;
      state.phase = "setterDecision";
      return;
    }

    if ((action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME")
      && role === state.setter) {

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

  socket.on("createRoom", cb => {
    let roomId;
    do roomId = generateRoomId(); while (rooms[roomId]);

    rooms[roomId] = {
      state: createInitialState(),
      players: {}
    };

    socket.join(roomId);
    rooms[roomId].players[socket.id] = null;

    cb({ ok: true, roomId });
    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);
    room.players[socket.id] = null;

    cb({ ok: true, roomId });
    emitLobby(roomId, { type: "playerJoined" });
    io.to(roomId).emit("stateUpdate", room.state);
  });

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

  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) delete room.players[socket.id];
    }
  });
});

// --------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("VS Wordle server running on", PORT);
});
