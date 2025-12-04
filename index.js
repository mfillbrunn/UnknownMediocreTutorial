// index.js — Final modular VS Wordle server
// Supports:
// - Role selection
// - Double-ready start
// - Simultaneous phase
// - Setter decision phase
// - Normal alternating turns
// - Game-over summary
// - Modular scoring + powers
//

const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

// ------------------------
// Game-engine imports
// ------------------------
const { scoreGuess } = require("./game-engine/scoring.js");
const { isConsistentWithHistory } = require("./game-engine/history.js");
const { isValidWord, parseWordlist } = require("./game-engine/validation.js");
const { applyFeedbackPowers } = require("./game-engine/rules.js");
const { pickReusableLetters } = require("./game-engine/powers.js");

// ------------------------
const { applySetterPower, applyGuesserPower } = require("./powers/applyPowers");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

// ----------------------------------------------------------------------
// LOAD WORD LIST
// ----------------------------------------------------------------------
let ALLOWED_GUESSES = [];

try {
  const raw = fs.readFileSync("./public/wordlists/allowed_guesses.txt", "utf8");
  ALLOWED_GUESSES = parseWordlist(raw);
  console.log("Loaded allowed words:", ALLOWED_GUESSES.length);
} catch (err) {
  console.log("Word list not found, allowing all words.");
}

// ----------------------------------------------------------------------
// INITIAL ROOM STATE
// ----------------------------------------------------------------------
const rooms = {};

function createInitialState() {
  return {
    phase: "lobby",       // "lobby", "simultaneous", "setterDecision", "normal", "gameOver"
    setter: "A",
    guesser: "B",

    turn: null,           // "A" or "B"
    ready: { A: false, B: false },

    secret: "",
    pendingGuess: "",
    guessCount: 0,
    firstSecretSet: false,

    history: [],  // each entry: { guess, fb, fbGuesser, hiddenIndices, extraInfo, finalSecret }

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
    },

    revealGreenInfo: null,
    gameOver: false
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

// ----------------------------------------------------------------------
// ANIMATION PUSHER
// ----------------------------------------------------------------------
function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}

// ----------------------------------------------------------------------
// FINALIZE FEEDBACK & RECORD HISTORY
// ----------------------------------------------------------------------
function finalizeFeedback(state, roomId) {
  if (!state.pendingGuess) return;

  const guess = state.pendingGuess.toLowerCase();

  // Score normally
  const fb = scoreGuess(state.secret, guess);

  // Apply power transformations
  const { fbGuesser, extraInfo } = applyFeedbackPowers(fb, state.powers);

  // Hide tiles (Hide Tile power)
  const hidden = [];
  let toHide = state.powers.hideTilePendingCount;
  const used = new Set();

  while (toHide > 0 && used.size < 5) {
    const idx = Math.floor(Math.random() * 5);
    if (!used.has(idx)) {
      used.add(idx);
      hidden.push(idx);
    }
    toHide--;
  }

  state.powers.hideTilePendingCount = 0;

  // Push into history
  state.history.push({
    guess,
    fb,
    fbGuesser,
    hiddenIndices: hidden,
    extraInfo,
    finalSecret: state.secret
  });

  state.guessCount++;

  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.powers.confuseColorsActive = false;
  state.powers.countOnlyActive = false;
}

// ----------------------------------------------------------------------
// TRANSITION to NORMAL after setter decision
// ----------------------------------------------------------------------
function enterNormalPhase(state, roomId) {
  finalizeFeedback(state, roomId);
  state.turn = state.guesser;
  state.phase = "normal";
  pushTurnAnimation(roomId, "setterSubmitted");
}

// ----------------------------------------------------------------------
// CHECK simultaneous phase completion
// ----------------------------------------------------------------------
function checkSimultaneousComplete(state) {
  return state.secret && state.pendingGuess;
}

// ----------------------------------------------------------------------
// APPLY ACTION
// ----------------------------------------------------------------------
function applyAction(state, action, role, roomId) {

  // --------------------------------------------------
  // Role picking
  // --------------------------------------------------

  if (action.type === "SET_ROLE") {
    room.players[socket.id] = action.role;

    // Re-evaluate setter/guesser based on roles
    if (action.role === "A") {
      state.setter = "A";
      state.guesser = "B";
    } else if (action.role === "B") {
      state.setter = "B";
      state.guesser = "A";
    }

    // Broadcast updated state to everyone
    io.to(roomId).emit("stateUpdate", state);
    return;
  }
  
  // --------------------------------------------------
  // Ready up
  // --------------------------------------------------
  if (action.type === "PLAYER_READY") {
    state.ready[action.role] = true;

    // If both are ready → start game
    if (state.ready.A && state.ready.B) {
      state.phase = "simultaneous";
      state.turn = null; // both play
      state.secret = "";
      state.pendingGuess = "";
    }
    return;
  }

  // --------------------------------------------------
  // NEW MATCH
  // --------------------------------------------------
  if (action.type === "NEW_MATCH") {
    const fresh = createInitialState();
    Object.assign(state, fresh);
    return;
  }

  // --------------------------------------------------
  // Powers
  // --------------------------------------------------
  if (action.type.startsWith("USE_")) {
    if (role === state.setter) {
      applySetterPower(state, action, role, roomId, io);
    } else if (role === state.guesser) {
      applyGuesserPower(state, action, role, roomId, io);
    }
    return;
  }


  // --------------------------------------------------
  // GAME OVER BLOCKS EVERYTHING
  // --------------------------------------------------
  if (state.gameOver) return;




  // ==================================================
  // PHASE: simultaneous
  // ==================================================
  if (state.phase === "simultaneous") {

    // Setter puts secret
    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      state.secret = w;

      if (checkSimultaneousComplete(state)) {
        state.phase = "setterDecision";
      }
      return;
    }

    // Guesser makes guess
    if (action.type === "SUBMIT_GUESS") {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      state.pendingGuess = g;

      if (checkSimultaneousComplete(state)) {
        state.phase = "setterDecision";
      }
      return;
    }

    // No Same Secret allowed yet (not meaningful)
    if (action.type === "SET_SECRET_SAME") return;
  }




  // ==================================================
  // PHASE: setterDecision
  // ==================================================
  if (state.phase === "setterDecision") {

    // Only setter may act
    if (role !== state.setter) return;

    if (action.type === "SET_SECRET_NEW") {
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      // Validate consistency
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




  // ==================================================
  // PHASE: normal
  // ==================================================
  if (state.phase === "normal") {

    // SUBMIT_GUESS
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

        state.guessCount++;
        state.gameOver = true;
        state.phase = "gameOver";
        state.turn = null;
        return;
      }

      state.pendingGuess = g;
      state.phase = "setterDecision";
      return;
    }

    // SET SECRET
    if ((action.type === "SET_SECRET_NEW" || action.type === "SET_SECRET_SAME") &&
        role === state.setter) {

      if (action.type === "SET_SECRET_NEW") {
        const w = action.secret.toLowerCase();
        if (!isValidWord(w, ALLOWED_GUESSES)) return;

        if (!isConsistentWithHistory(state.history, w)) return;
        state.secret = w;
      }

      if (action.type === "SET_SECRET_SAME") {
        if (!isConsistentWithHistory(state.history, state.secret)) return;
      }

      enterNormalPhase(state, roomId);
      return;
    }
  }
}


// ----------------------------------------------------------------------
// SOCKET SETUP
// ----------------------------------------------------------------------
io.on("connection", socket => {

  // Create room
  socket.on("createRoom", cb => {
    let roomId;
    do roomId = generateRoomId();
    while (rooms[roomId]);

    rooms[roomId] = {
      state: createInitialState(),
      players: {}
    };

    socket.join(roomId);

    cb({
      ok: true,
      roomId,
      availableRoles: ["A", "B"]
    });

    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  // Join room
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);

    cb({ ok: true, roomId });
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // Game actions
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Resolve role
    const role = room.players[socket.id] || null;

    // Assign role if requested
    if (action.type === "SET_ROLE") {
      room.players[socket.id] = action.role;
    }

    applyAction(room.state, action, role, roomId);

    // Broadcast state
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (const [rid, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
      }
    }
  });
});


// ----------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("VS Wordle server running on port", PORT);
});
