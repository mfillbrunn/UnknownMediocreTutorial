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
  // SWITCH ROLES (LOBBY ONLY)
  // ---------------------
  if (action.type === "SWITCH_ROLES") {
    if (state.phase !== "lobby") return;

    const ids = Object.keys(room.players);
    if (ids.length === 2) {
      const idA = ids.find(id => room.players[id] === "A");
      const idB = ids.find(id => room.players[id] === "B");

      room.players[idA] = "B";
      room.players[idB] = "A";

      // also swap logical setter/guesser labels if you want
      const tmp = state.setter;
      state.setter = state.guesser;
      state.guesser = tmp;

      emitLobby(roomId, {
        type: "rolesSwitched",
        setterId: idA,
        guesserId: idB
      });
    }
    return;
  }

  // ---------------------
  // PLAYER READY (LOBBY)
  // ---------------------
  if (action.type === "PLAYER_READY") {
    if (state.phase !== "lobby") return;

    const r = role; // "A" or "B"
    state.ready[r] = true;

    emitLobby(roomId, { type: "playerReady", role: r });

    if (state.ready.A && state.ready.B) {
      // start first round: both act in parallel
      state.phase = "simultaneous";
      state.turn = null;           // simultaneous → no single turn owner
      state.firstSecretSet = false;
      state.pendingGuess = "";
      emitLobby(roomId, { type: "hideLobby" });
    }
    return;
  }

  // ---------------------
  // NEW MATCH (ANY PHASE)
  // ---------------------
  if (action.type === "NEW_MATCH") {
    Object.assign(state, createInitialState());
    return;
  }

  // ---------------------
  // POWERS (ANY PHASE)
  // ---------------------
  if (action.type.startsWith("USE_")) {
    if (role === state.setter) applySetterPower(state, action, role, roomId, io);
    if (role === state.guesser) applyGuesserPower(state, action, role, roomId, io);
    return;
  }

  // ===================================================================
  // PHASE: SIMULTANEOUS
  //   - Setter: SET_SECRET_NEW
  //   - Guesser: SUBMIT_GUESS
  //   When both are present → move to NORMAL with setter's turn.
  // ===================================================================
  if (state.phase === "simultaneous") {

    // Setter chooses initial secret
    if (action.type === "SET_SECRET_NEW" && role === state.setter) {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      state.secret = w;
      state.firstSecretSet = true;
    }

    // Guesser submits initial guess (only allowed after secret exists)
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      if (!state.firstSecretSet) return;

      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      state.pendingGuess = g;
    }

    // If both sides have acted → move to normal, setter decides first
    if (state.secret && state.pendingGuess) {
      state.phase = "normal";
      state.turn = state.setter; // Setter decides SAME/NEW
    }

    return;
  }

  // ===================================================================
  // PHASE: NORMAL
  //   We encode "setterDecision" vs "guesserTurn" using:
  //   - state.pendingGuess present  → setter is deciding (turn = setter)
  //   - state.pendingGuess empty    → guesser is guessing (turn = guesser)
  // ===================================================================
  if (state.phase === "normal") {

    // --- CASE 1: Setter's decision step (pendingGuess exists) ---
    if (state.pendingGuess) {

      // Only setter may resolve the pending guess
      if (role !== state.setter) return;

      if (action.type === "SET_SECRET_NEW") {
        const w = action.secret.toLowerCase();
        if (!isValidWord(w, ALLOWED_GUESSES)) return;
        if (!isConsistentWithHistory(state.history, w)) return;
        state.secret = w;
      } else if (action.type === "SET_SECRET_SAME") {
        if (!isConsistentWithHistory(state.history, state.secret)) return;
        // keep same secret
      } else {
        // Other actions during setter decision ignored
        return;
      }

      // Resolve feedback + move to guesser turn
      finalizeFeedback(state);
      state.turn = state.guesser;   // next: guesser guesses again
      return;
    }

    // --- CASE 2: Guesser turn (no pendingGuess yet) ---
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      // Win condition
      if (g === state.secret) {
        state.history.push({
          guess: g,
          fb: ["🟩","🟩","🟩","🟩","🟩"],
          fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
          extraInfo: null,
          finalSecret: state.secret
        });
        state.phase = "gameOver";
        state.turn = null;
        state.gameOver = true;
        io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
        return;
      }

      // Otherwise, we store the guess and pass turn to setter
      state.pendingGuess = g;
      state.turn = state.setter; // setter decides SAME/NEW next
      return;
    }

    return;
  }

  // ===================================================================
  // PHASE: gameOver
  //   Only NEW_MATCH is really meaningful (handled above).
  // ===================================================================
  if (state.phase === "gameOver") {
    // nothing special here (NEW_MATCH already handled)
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

  const role = room.players[socket.id];  // "A" or "B"
  if (!role) return;                     // safety

  action.playerId = socket.id;
  action.role = role;

  applyAction(room, room.state, action, role, roomId);

  // 🔁 ALWAYS broadcast the updated state after applying an action
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
