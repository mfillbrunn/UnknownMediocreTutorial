// index.js — Updated Server with Modular Powers + Wordlist Support

const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

const { applySetterPower, applyGuesserPower } = require("./powers/applyPowers");
const { modifyFeedbackForGuesser } = require("./powers/modifyFeedback");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files from /public
app.use(express.static("public"));

// ---------------------------------------------------------
// Load allowed words (TXT, one per line)
// ---------------------------------------------------------
let ALLOWED_GUESSES = [];
try {
  const raw = fs.readFileSync("./public/wordlists/allowed_guesses.txt", "utf8");
  ALLOWED_GUESSES = raw
    .split(/\r?\n/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length === 5);
  console.log("Loaded allowed guesses:", ALLOWED_GUESSES.length);
} catch (e) {
  console.log("No allowed wordlist found or error reading it.", e);
}

// ---------------------------------------------------------
// Utility — check validity of secret / guess
// ---------------------------------------------------------
function isValidWord(w) {
  if (!w || w.length !== 5) return false;
  if (ALLOWED_GUESSES.length === 0) return true; // allow all if no list
  return ALLOWED_GUESSES.includes(w.toLowerCase());
}

// ---------------------------------------------------------
// ROOM STATE
// ---------------------------------------------------------
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

    // All powers (old + new)
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

// ---------------------------------------------------------
// WORDLE SCORING
// ---------------------------------------------------------
function scoreGuess(secretWord, guess) {
  const fb = ["","","","",""];
  const rem = secretWord.split("");

  // greens
  for (let i = 0; i < 5; i++) {
    if (guess[i] === secretWord[i]) {
      fb[i] = "🟩";
      rem[i] = null;
    }
  }

  // yellows / blacks
  for (let i = 0; i < 5; i++) {
    if (fb[i] === "") {
      const pos = rem.indexOf(guess[i]);
      if (pos !== -1) {
        fb[i] = "🟨";
        rem[pos] = null;
      } else {
        fb[i] = "⬛";
      }
    }
  }
  return fb;
}

function isConsistentWithHistory(state, word) {
  for (const h of state.history) {
    const expected = scoreGuess(word, h.guess).join("");
    const actual = h.fb.join("");
    if (expected !== actual) return false;
  }
  return true;
}

// ---------------------------------------------------------
// ROUND HELPERS
// ---------------------------------------------------------
function resetRoundState(state) {
  state.secret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.firstSecretSet = false;
  state.history = [];

  // Reset all powers
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

function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}

// ---------------------------------------------------------
// FINALIZE FEEDBACK
// ---------------------------------------------------------
function finalizeFeedback(state, roomId) {
  if (!state.pendingGuess) return;
  const guess = state.pendingGuess.toLowerCase();

  // Score guess
  const fb = scoreGuess(state.secret, guess);

  // ---------------------------
  // APPLY POWER FEEDBACK MODS
  // ---------------------------
  const { fbForGuesser, extraInfo } = modifyFeedbackForGuesser(state, fb);

  // hidden tile logic (Hide Tile power)
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

  // Push history (true feedback for setter)
  state.history.push({
    guess,
    fb,                // actual feedback for setter
    fbGuesser: fbForGuesser,
    hiddenIndices: hidden,
    extraInfo
  });

  state.guessCount++;
  if (!state.roundStats[state.roundNumber].guesser) {
    state.roundStats[state.roundNumber].guesser = state.guesser;
  }

  // Turn passes back
  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.powers.confuseColorsActive = false;
  state.powers.countOnlyActive = false;

  state.turn = state.guesser;
  pushTurnAnimation(roomId, "setterSubmitted");
}

// ---------------------------------------------------------
// ACTION HANDLER
// ---------------------------------------------------------
function applyAction(state, action, role, roomId) {
  // -------------------------
  // Powers (setter or guesser)
  // -------------------------
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
      break;

    case "START_ROUND_2":
      if (state.roundNumber !== 1) break;
      if (!state.roundStats[1].guesser || state.roundStats[1].guesses == null) break;

      state.roundNumber = 2;
      state.setter = "B";
      state.guesser = "A";
      resetRoundState(state);
      break;

    // -------------------------
    // SET SECRET (NEW)
    // -------------------------
    case "SET_SECRET_NEW": {
      if (role !== state.setter) break;
      if (state.turn !== state.setter) break;

      const w = (action.secret || "").toLowerCase();
      if (!isValidWord(w)) break;

      if (state.powers.freezeActive && state.firstSecretSet) break;
      if (state.firstSecretSet && !isConsistentWithHistory(state, w)) break;

      state.secret = w;

      // Use-up reuse-pool
      state.powers.reuseLettersPool = [];

      if (!state.firstSecretSet) {
        state.firstSecretSet = true;
        state.turn = state.guesser;
        pushTurnAnimation(roomId, "setterSubmitted");
        break;
      }

      finalizeFeedback(state, roomId);
      break;
    }

    // -------------------------
    // KEEP SAME SECRET
    // -------------------------
    case "SET_SECRET_SAME": {
      if (role !== state.setter) break;
      if (state.turn !== state.setter) break;

      if (!state.firstSecretSet) break;
      if (!isConsistentWithHistory(state, state.secret)) break;

      finalizeFeedback(state, roomId);
      break;
    }

    // -------------------------
    // SUBMIT GUESS
    // -------------------------
    case "SUBMIT_GUESS": {
      if (role !== state.guesser) break;
      if (state.turn !== state.guesser) break;

      const g = (action.guess || "").toLowerCase();
      if (!isValidWord(g)) break;

      // Instant win
      if (state.secret && g === state.secret) {
        state.guessCount++;

        if (!state.roundStats[state.roundNumber].guesser) {
          state.roundStats[state.roundNumber].guesser = state.guesser;
        }
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
        state.powers.freezeActive = false;
        state.powers.confuseColorsActive = false;
        state.powers.countOnlyActive = false;

        pushTurnAnimation(roomId, "guesserSubmitted");
        break;
      }

      state.pendingGuess = g;
      state.turn = state.setter;
      pushTurnAnimation(roomId, "guesserSubmitted");
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------
// SOCKET EVENTS
// ---------------------------------------------------------
io.on("connection", socket => {

  // Create room
  socket.on("createRoom", (cb) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

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

  // Join room
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);

    const taken = Object.values(room.players);
    const available = ["A","B","spectator"].filter(r => !taken.includes(r) || r === "spectator");

    cb({
      ok: true,
      roomId,
      availableRoles: available
    });
  });

  // Choose role
  socket.on("chooseRole", ({ roomId, role }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false });

    room.players[socket.id] = role;
    cb({ ok: true, role });

    io.to(roomId).emit("stateUpdate", room.state);
  });

  socket.on("rejoinRoom", ({ roomId, role }) => {
    const room = rooms[roomId];
    if (!room) return;

    socket.join(roomId);
    room.players[socket.id] = role;
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // Gameplay actions
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const role = room.players[socket.id] || "spectator";
    applyAction(room.state, action, role, roomId);

    io.to(roomId).emit("stateUpdate", room.state);
  });

  // Disconnect
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

// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
