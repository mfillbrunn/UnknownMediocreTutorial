// index.js — Modular Server using game-engine
// -------------------------------------------
// This is a COMPLETE replacement for your previous index.js

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
const { modifyFeedbackForGuesser } = require("./powers/modifyFeedback"); // (legacy fallback)

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
// ROOM STATE
// ----------------------------------------------------------------------
const rooms = {};

function createInitialState() {
  return {
    roundNumber: 1,
    setter: "A",
    guesser: "B",
    turn: "A",

    secret: "",
    pendingGuess: "",
    guessCount: 0,
    firstSecretSet: false,

    history: [],

    roundStats: {
      1: { guesser: null, guesses: null },
      2: { guesser: null, guesses: null }
    },

    // All powers
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

    revealGreenInfo: null
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
// RESET ROUND
// ----------------------------------------------------------------------
function resetRoundState(state) {
  state.secret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.firstSecretSet = false;
  state.history = [];

  state.powers = {
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
  };

  state.revealGreenInfo = null;
  state.turn = state.setter;
}

// ----------------------------------------------------------------------
// ANIMATIONS
// ----------------------------------------------------------------------
function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}

// ----------------------------------------------------------------------
// FINALIZE FEEDBACK (NOW USING GAME ENGINE)
// ----------------------------------------------------------------------
function finalizeFeedback(state, roomId) {
  if (!state.pendingGuess) return;

  const guess = state.pendingGuess.toLowerCase();
  const fb = scoreGuess(state.secret, guess); // ← game-engine scoring

  // Apply power-based transformations (blue mode / count-only)
  const { fbGuesser, extraInfo } = applyFeedbackPowers(fb, state.powers);

  // Handle Hide Tile (same logic as before)
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

  // Store in history (true fb + transformed fb)
  state.history.push({
    guess,
    fb,
    fbGuesser,
    hiddenIndices: hidden,
    extraInfo
  });

  state.guessCount++;

  if (!state.roundStats[state.roundNumber].guesser) {
    state.roundStats[state.roundNumber].guesser = state.guesser;
  }

  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.powers.confuseColorsActive = false;
  state.powers.countOnlyActive = false;

  state.turn = state.guesser;

  pushTurnAnimation(roomId, "setterSubmitted");
}

// ----------------------------------------------------------------------
// ACTION HANDLER (CLEANED + MODULAR)
// ----------------------------------------------------------------------
function applyAction(state, action, role, roomId) {

  // Powers
  if (action.type.startsWith("USE_")) {
    if (role === state.setter) {
      applySetterPower(state, action, role, roomId, io);
    } else if (role === state.guesser) {
      applyGuesserPower(state, action, role, roomId, io);
    }
    return;
  }

  switch (action.type) {

    case "NEW_MATCH":
      Object.assign(state, createInitialState());
      return;

    case "START_ROUND_2":
      if (state.roundNumber !== 1) return;
      state.roundNumber = 2;
      state.setter = "B";
      state.guesser = "A";
      resetRoundState(state);
      return;

    // SET SECRET (NEW)
    case "SET_SECRET_NEW": {
      if (role !== state.setter) return;
      if (state.turn !== state.setter) return;

      const w = (action.secret || "").toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;

      if (state.powers.freezeActive && state.firstSecretSet) return;

      if (state.firstSecretSet && !isConsistentWithHistory(state.history, w)) {
        return;
      }

      state.secret = w;

      // Reset reuse letters after submitting new secret
      state.powers.reuseLettersPool = [];

      if (!state.firstSecretSet) {
        state.firstSecretSet = true;
        state.turn = state.guesser;
        pushTurnAnimation(roomId, "setterSubmitted");
      } else {
        finalizeFeedback(state, roomId);
      }
      return;
    }

    // KEEP SAME SECRET
    case "SET_SECRET_SAME": {
      if (role !== state.setter) return;
      if (!state.firstSecretSet) return;
      if (!isConsistentWithHistory(state.history, state.secret)) return;

      finalizeFeedback(state, roomId);
      return;
    }

    // SUBMIT GUESS
    case "SUBMIT_GUESS": {
      if (role !== state.guesser) return;
      if (state.turn !== state.guesser) return;

      const g = (action.guess || "").toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;

      // Instant win
      if (state.secret && g === state.secret) {
        state.guessCount++;

        state.roundStats[state.roundNumber].guesser ||= state.guesser;
        state.roundStats[state.roundNumber].guesses = state.guessCount;

        state.history.push({
          guess: g,
          fb: ["🟩","🟩","🟩","🟩","🟩"],
          fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
          hiddenIndices: [],
          extraInfo: null
        });

        state.turn = "none";
        state.pendingGuess = "";
        return;
      }

      state.pendingGuess = g;
      state.turn = state.setter;
      pushTurnAnimation(roomId, "guesserSubmitted");
      return;
    }
  }
}

// ----------------------------------------------------------------------
// SOCKET HANDLERS
// ----------------------------------------------------------------------
io.on("connection", socket => {

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
      availableRoles: ["A","B","spectator"]
    });

    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);

    const taken = Object.values(room.players);
    const available = ["A","B","spectator"].filter(r =>
      !taken.includes(r) || r === "spectator"
    );

    cb({ ok: true, roomId, availableRoles: available });
  });

  socket.on("chooseRole", ({ roomId, role }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false });

    room.players[socket.id] = role;
    cb({ ok: true, role });

    io.to(roomId).emit("stateUpdate", room.state);
  });

  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const role = room.players[socket.id] || "spectator";

    applyAction(room.state, action, role, roomId);
    io.to(roomId).emit("stateUpdate", room.state);
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

// ----------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on", PORT);
});
