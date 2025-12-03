// index.js - Node server with Socket.IO for multiplayer Wordle (Improved Version)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static files from /public
app.use(express.static("public"));

// -----------------------------------------------------
// ROOM + GAME STATE
// -----------------------------------------------------
socket.on("createRoom", (cb) => {
  let roomId;
  do {
    roomId = generateRoomId();
  } while (rooms[roomId]);

  rooms[roomId] = {
    state: createInitialState(),
    players: {}
  };

  // creator joins but has NO ROLE yet
  socket.join(roomId);

  cb({
    ok: true,
    roomId,
    availableRoles: ["A", "B", "spectator"]
  });

  // Note: do NOT assign role automatically
  io.to(roomId).emit("stateUpdate", rooms[roomId].state);
});

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

    powers: {
      hideTileUsed: false,
      hideTilePendingCount: 0,      // CHANGED: up to 2 tiles
      revealGreenUsed: false,
      freezeSecretUsed: false,
      freezeActive: false
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

// -----------------------------------------------------
// WORDLE SCORING
// -----------------------------------------------------

function scoreGuess(secretWord, guess) {
  const fb = ["", "", "", "", ""];
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

// -----------------------------------------------------
// ROUND TRANSITION HELPERS
// -----------------------------------------------------

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
    freezeActive: false
  };
  state.revealGreenInfo = null;
  state.turn = state.setter;
}

function pushPowerNotification(roomId, player, type) {
  io.to(roomId).emit("powerUsed", { player, type });
}

function pushTurnAnimation(roomId, type) {
  io.to(roomId).emit("animateTurn", { type });
}

// -----------------------------------------------------
// MAIN ACTION HANDLER
// -----------------------------------------------------

function applyAction(state, action, role, roomId) {
  const actingPlayer = role;

  switch (action.type) {

    // ---------------------------------------------------
    // NEW MATCH
    // ---------------------------------------------------
    case "NEW_MATCH": {
      Object.assign(state, createInitialState());
      break;
    }

    // ---------------------------------------------------
    // ROUND 2 START
    // ---------------------------------------------------
    case "START_ROUND_2": {
      if (state.roundNumber !== 1) break;
      if (!state.roundStats[1].guesser || state.roundStats[1].guesses == null) break;

      state.roundNumber = 2;
      state.setter = "B";
      state.guesser = "A";
      resetRoundState(state);
      break;
    }

    // ---------------------------------------------------
    // SET SECRET (NEW)
    // ---------------------------------------------------
    case "SET_SECRET_NEW": {
      if (actingPlayer !== state.setter) break;
      if (state.turn !== state.setter) break;

      const w = (action.secret || "").toLowerCase();
      if (w.length !== 5) break;

      // freeze active => cannot change secret (beyond first)
      if (state.powers.freezeActive && state.firstSecretSet) break;

      if (state.firstSecretSet && !isConsistentWithHistory(state, w)) break;

      state.secret = w;

      if (!state.firstSecretSet) {
        state.firstSecretSet = true;
        state.turn = state.guesser;
        pushTurnAnimation(roomId, "setterSubmitted");
        break;
      }

      finalizeFeedback(state, roomId);
      break;
    }

    // ---------------------------------------------------
    // SET SECRET (SAME)
    // ---------------------------------------------------
    case "SET_SECRET_SAME": {
      if (actingPlayer !== state.setter) break;
      if (state.turn !== state.setter) break;

      if (!state.firstSecretSet) break;
      if (!isConsistentWithHistory(state, state.secret)) break;

      finalizeFeedback(state, roomId);
      break;
    }

    // ---------------------------------------------------
    // HIDE TILE POWER (UP TO TWO)
    // ---------------------------------------------------
    case "USE_HIDE_TILE": {
      if (actingPlayer !== state.setter) break;
      if (state.powers.hideTileUsed && state.powers.hideTilePendingCount === 0) break;

      state.powers.hideTileUsed = true;
      state.powers.hideTilePendingCount = Math.min(
        2,
        state.powers.hideTilePendingCount + 1
      );

      pushPowerNotification(roomId, actingPlayer, "USE_HIDE_TILE");
      break;
    }

    // ---------------------------------------------------
    // SUBMIT GUESS
    // ---------------------------------------------------
    case "SUBMIT_GUESS": {
      if (actingPlayer !== state.guesser) break;
      if (state.turn !== state.guesser) break;

      const g = (action.guess || "").toLowerCase();
      if (g.length !== 5) break;

      // WIN check
      if (state.secret && g === state.secret) {
        state.guessCount++;
        if (!state.roundStats[state.roundNumber].guesser) {
          state.roundStats[state.roundNumber].guesser = state.guesser;
        }
        state.roundStats[state.roundNumber].guesses = state.guessCount;

        const fb = ["🟩","🟩","🟩","🟩","🟩"];
        state.history.push({ guess: g, fb, hiddenIndices: [] });

        state.turn = "none";
        state.pendingGuess = "";
        state.powers.freezeActive = false;

        pushTurnAnimation(roomId, "guesserSubmitted");
        break;
      }

      // normal guess
      state.pendingGuess = g;
      state.turn = state.setter;

      pushTurnAnimation(roomId, "guesserSubmitted");
      break;
    }

    // ---------------------------------------------------
    // REVEAL GREEN
    // ---------------------------------------------------
    case "USE_REVEAL_GREEN": {
      if (actingPlayer !== state.guesser) break;
      if (state.powers.revealGreenUsed) break;
      if (!state.secret || state.secret.length !== 5) break;

      const pos = Math.floor(Math.random() * 5);
      const letter = state.secret[pos].toUpperCase();

      state.revealGreenInfo = { pos, letter };
      state.powers.revealGreenUsed = true;

      pushPowerNotification(roomId, actingPlayer, "USE_REVEAL_GREEN");
      break;
    }

    // ---------------------------------------------------
    // FREEZE SECRET
    // ---------------------------------------------------
    case "USE_FREEZE_SECRET": {
      if (actingPlayer !== state.guesser) break;
      if (state.powers.freezeSecretUsed) break;
      if (!state.firstSecretSet) break;

      state.powers.freezeSecretUsed = true;
      state.powers.freezeActive = true;

      pushPowerNotification(roomId, actingPlayer, "USE_FREEZE_SECRET");
      break;
    }

    default:
      break;
  }
}

// -----------------------------------------------------
// FINALIZE FEEDBACK (setter resolves guess)
// -----------------------------------------------------

function finalizeFeedback(state, roomId) {
  if (!state.pendingGuess) return;

  const fb = scoreGuess(state.secret, state.pendingGuess);

  // pick hidden indices
  let hiddenIndices = [];
  let count = state.powers.hideTilePendingCount;
  const used = new Set();
  while (count > 0 && used.size < 5) {
    const idx = Math.floor(Math.random() * 5);
    if (!used.has(idx)) {
      used.add(idx);
      hiddenIndices.push(idx);
    }
    count--;
  }
  state.powers.hideTilePendingCount = 0;

  state.history.push({
    guess: state.pendingGuess,
    fb,
    hiddenIndices
  });

  state.guessCount++;

  if (!state.roundStats[state.roundNumber].guesser) {
    state.roundStats[state.roundNumber].guesser = state.guesser;
  }

  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.turn = state.guesser;

  pushTurnAnimation(roomId, "setterSubmitted");
}

// -----------------------------------------------------
// SOCKET.IO
// -----------------------------------------------------

io.on("connection", (socket) => {
  console.log("connection", socket.id);

  // --------------------------
  // Create room
  // --------------------------
  socket.on("createRoom", (cb) => {
    let roomId;
    do {
      roomId = generateRoomId();
    } while (rooms[roomId]);

    rooms[roomId] = {
      state: createInitialState(),
      players: {} // socketId: "A"|"B"|"spectator"
    };

    socket.join(roomId);
    rooms[roomId].players[socket.id] = "A";

    cb({ roomId, playerRole: "A", availableRoles: ["A","B","spectator"] });

    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  // --------------------------
  // Join room
  // --------------------------
  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: "Room not found" });

    socket.join(roomId);

    const taken = Object.values(room.players);
    const available = ["A","B","spectator"].filter(r => !taken.includes(r) || r === "spectator");

    cb({ ok: true, roomId, availableRoles: available });
  });

  // --------------------------
  // Choose explicit role
  // --------------------------
  socket.on("chooseRole", ({ roomId, role }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false });

    room.players[socket.id] = role;

    cb && cb({ ok: true, role });

    io.to(roomId).emit("stateUpdate", room.state);
  });

  // --------------------------
  // Rejoin room after reconnect
  // --------------------------
  socket.on("rejoinRoom", ({ roomId, role }) => {
    const room = rooms[roomId];
    if (!room) return;
    socket.join(roomId);
    room.players[socket.id] = role;
    io.to(roomId).emit("stateUpdate", room.state);
  });

  // --------------------------
  // Game actions
  // --------------------------
  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const state = room.state;
    const role = room.players[socket.id] || "spectator";

    applyAction(state, action, role, roomId);

    io.to(roomId).emit("stateUpdate", state);
  });

  // --------------------------
  // Disconnect
  // --------------------------
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
