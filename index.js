// index.js — Patched for Automatic Roles, Stable Assignment, Correct Switching, Ready Logic, Max Players

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

const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
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
} catch {}

const rooms = {};

// --------------------------------------
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
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function emitLobby(roomId, payload) {
  io.to(roomId).emit("lobbyEvent", payload);
}

// ------------------------------------------------------------------
// STABLE ROLE ASSIGNMENT (OPTION A)
// ------------------------------------------------------------------
function assignRoles(room) {
  const ids = Object.keys(room.players);

  if (ids.length === 0) return;

  if (ids.length === 1) {
    // first player is always A / Setter
    room.players[ids[0]] = "A";
    return;
  }

  if (ids.length === 2) {
    // second player always B / Guesser
    room.players[ids[0]] = "A";
    room.players[ids[1]] = "B";
    return;
  }
}

// --------------------------------------
function finalizeFeedback(state) {
  const guess = state.pendingGuess;
  const fb = scoreGuess(state.secret, guess);

  const powered = modifyFeedback(fb, state, guess);

  state.history.push({
    guess,
    fb,
    fbGuesser: powered.fbGuesser,
    extraInfo: powered.extraInfo,
    finalSecret: state.secret
  });

  state.pendingGuess = "";
  state.guessCount++;
  state.powers.freezeActive = false;
  state.powers.confuseColorsActive = false;
  state.powers.countOnlyActive = false;
}

function enterNormalPhase(state, roomId) {
  finalizeFeedback(state);
  state.phase = "normal";
  state.turn = state.guesser;
  io.to(roomId).emit("animateTurn", { type: "setterSubmitted" });
}

function simultaneousComplete(state) {
  return state.secret && state.pendingGuess;
}

// --------------------------------------
// APPLY ACTIONS
// --------------------------------------
function applyAction(room, state, action, role, roomId) {

  // ---------------------
  // SWITCH ROLES
  // ---------------------
  if (action.type === "SWITCH_ROLES") {
    if (state.phase !== "lobby") return;

    // swap A <-> B
    const ids = Object.keys(room.players);
    if (ids.length === 2) {
      const idA = ids.find(id => room.players[id] === "A");
      const idB = ids.find(id => room.players[id] === "B");

      room.players[idA] = "B";
      room.players[idB] = "A";

      // swap in state too
      let temp = state.setter;
      state.setter = state.guesser;
      state.guesser = temp;

      emitLobby(roomId, {
        type: "rolesSwitched",
        setterId: idA,
        guesserId: idB
      });
    }
    return;
  }

  // ---------------------
  // PLAYER READY
  // ---------------------
  if (action.type === "PLAYER_READY") {
    const r = role;   // ★ FIX: role already known from socket
    state.ready[r] = true;

    emitLobby(roomId, { type: "playerReady", role: r });

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
    Object.assign(state, createInitialState());
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
  // SIMULTANEOUS PHASE
  // ---------------------
  if (state.phase === "simultaneous") {

    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      state.secret = w;
      state.firstSecretSet = true;

      if (simultaneousComplete(state))
        state.phase = "setterDecision";
        emitLobby(roomId, { type: "enterSetterDecision" });
      return;
    }

    if (action.type === "SUBMIT_GUESS") {
      if (!state.firstSecretSet) return;

      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      state.pendingGuess = g;

      if (simultaneousComplete(state))
        state.phase = "setterDecision";

      return;
    }

    return;
  }

  // ---------------------
  // SETTER DECISION
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
  // NORMAL
  // ---------------------
  if (state.phase === "normal") {

    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      if (g === state.secret) {
        state.history.push({
          guess: g,
          fb: ["🟩","🟩","🟩","🟩","🟩"],
          fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
          finalSecret: state.secret
        });
        state.phase = "gameOver";
        state.turn = null;
        return;
      }

      state.pendingGuess = g;
      state.phase = "setterDecision";
      return;
    }

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
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);
  
    rooms[roomId] = { state: createInitialState(), players: {} };
    socket.join(roomId);
  
    rooms[roomId].players[socket.id] = "A";
    assignRoles(rooms[roomId]);
  
    socket.emit("roleAssigned", {
      role: "A",
      setterId: socket.id,
      guesserId: null
    });

    cb({ ok: true, roomId });
  
    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });


  // JOIN ROOM
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok:false, error:"Room not found" });

    if (Object.keys(room.players).length >= 2)
      return cb({ ok:false, error:"Room is full" });

    socket.join(roomId);

    room.players[socket.id] = "B";   // Second always Guesser
    assignRoles(room);

    // find setter + guesser sockets
    const setterId = Object.keys(room.players).find(id => room.players[id] === "A");
    const guesserId = Object.keys(room.players).find(id => room.players[id] === "B");
    
    socket.emit("roleAssigned", {
      role: room.players[socket.id],
      setterId,
      guesserId
    });


    cb({ ok:true, roomId });
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // GAME ACTION
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const role = room.players[socket.id];  // guaranteed to be "A" or "B"
    action.playerId = socket.id;
    action.role = role;                    // ⭐ pass role explicitly to applyAction
    applyAction(room, room.state, action, role, roomId);
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      delete room.players[socket.id];
      assignRoles(room);  // keep roles stable
    }
  });
});

// --------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("VS Wordle server running on", PORT));
