// index.js - Node server with Socket.IO for multiplayer Wordle

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// Serve static files from /public
app.use(express.static("public"));

// ----------------- GAME STATE / ROOMS -----------------

// rooms = { [roomId]: { state, players: {socketId: "A"|"B"|"spectator"} } }
const rooms = {};

function createInitialState() {
  return {
    roundNumber: 1,
    setter: "A",
    guesser: "B",
    turn: "A", // "A" or "B" or "none"

    secret: "",
    pendingGuess: "",
    guessCount: 0,
    firstSecretSet: false,

    // history entries: { guess: "abcde", fb: ["🟩","⬛",...], hiddenIndex: number|null }
    history: [],

    roundStats: {
      1: { guesser: null, guesses: null },
      2: { guesser: null, guesses: null }
    },

    powers: {
      hideTileUsed: false,
      hideTilePending: false,
      revealGreenUsed: false,
      freezeSecretUsed: false,
      freezeActive: false
    },

    // extra info for reveal-green power (optional, not fully used in UI)
    revealGreenInfo: null // { pos, letter } or null
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

// ---- Wordle scoring ----
function scoreGuess(secretWord, guess) {
  const fb = ["", "", "", "", ""];
  const rem = secretWord.split("");

  // Greens
  for (let i = 0; i < 5; i++) {
    if (guess[i] === secretWord[i]) {
      fb[i] = "🟩";
      rem[i] = null;
    }
  }
  // Yellows / Blacks
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

// ---- Round transitions ----

function resetRoundState(state) {
  state.secret = "";
  state.pendingGuess = "";
  state.guessCount = 0;
  state.firstSecretSet = false;
  state.history = [];
  state.powers = {
    hideTileUsed: false,
    hideTilePending: false,
    revealGreenUsed: false,
    freezeSecretUsed: false,
    freezeActive: false
  };
  state.revealGreenInfo = null;
  // Turn goes to setter at round start
  state.turn = state.setter;
}

// central action handler
function applyAction(state, action, role) {
  // role is "A", "B", or "spectator"
  const actingPlayer = role;

  switch (action.type) {
    // ---- Setup / meta ----
    case "NEW_MATCH": {
      // allow anyone for now
      const fresh = createInitialState();
      Object.assign(state, fresh);
      break;
    }

    case "START_ROUND_2": {
      if (state.roundNumber !== 1) break;
      // only proceed if round 1 has stats
      if (!state.roundStats[1].guesser || state.roundStats[1].guesses == null) break;

      state.roundNumber = 2;
      state.setter = "B";
      state.guesser = "A";
      resetRoundState(state);
      break;
    }

    // ---- Setter actions ----
    case "SET_SECRET_NEW": {
      if (actingPlayer !== state.setter) break;
      if (state.turn !== state.setter) break;

      const w = (action.secret || "").toLowerCase();
      if (w.length !== 5) break;

      // if freeze secret is active and this is NOT the first secret, cannot change
      if (state.powers.freezeActive && state.firstSecretSet) {
        // ignore attempt to change
        break;
      }

      if (state.firstSecretSet && !isConsistentWithHistory(state, w)) {
        // new secret inconsistent with previous feedback, ignore
        break;
      }

      state.secret = w;

      if (!state.firstSecretSet) {
        state.firstSecretSet = true;
        // first secret: no feedback yet, pass to guesser
        state.turn = state.guesser;
        break;
      }

      // otherwise normal feedback finalization
      finalizeFeedback(state);
      break;
    }

    case "SET_SECRET_SAME": {
      if (actingPlayer !== state.setter) break;
      if (state.turn !== state.setter) break;

      if (!state.firstSecretSet) break;
      if (!isConsistentWithHistory(state, state.secret)) break;

      finalizeFeedback(state);
      break;
    }

    case "USE_HIDE_TILE": {
      if (actingPlayer !== state.setter) break;
      if (state.powers.hideTileUsed) break;
      // can be used anytime by setter (we don't strictly gate by turn)
      state.powers.hideTileUsed = true;
      state.powers.hideTilePending = true;
      break;
    }

    // ---- Guesser actions ----
    case "SUBMIT_GUESS": {
      if (actingPlayer !== state.guesser) break;
      if (state.turn !== state.guesser) break;

      const g = (action.guess || "").toLowerCase();
      if (g.length !== 5) break;

      // instant win check
      if (state.secret && g === state.secret) {
        state.guessCount++;
        if (!state.roundStats[state.roundNumber].guesser) {
          state.roundStats[state.roundNumber].guesser = state.guesser;
        }
        state.roundStats[state.roundNumber].guesses = state.guessCount;

        const fb = ["🟩","🟩","🟩","🟩","🟩"];
        state.history.push({ guess: g, fb, hiddenIndex: null });

        state.turn = "none";
        state.pendingGuess = "";
        state.powers.freezeActive = false;
        break;
      }

      // normal guess: store and pass to setter
      state.pendingGuess = g;
      state.turn = state.setter;
      break;
    }

    case "USE_REVEAL_GREEN": {
      if (actingPlayer !== state.guesser) break;
      if (state.powers.revealGreenUsed) break;
      if (!state.secret || state.secret.length !== 5) break;

      // pick random position
      const positions = [0,1,2,3,4];
      const pos = positions[Math.floor(Math.random() * positions.length)];
      const letter = state.secret[pos].toUpperCase();

      state.revealGreenInfo = { pos, letter };
      state.powers.revealGreenUsed = true;
      break;
    }

    case "USE_FREEZE_SECRET": {
      if (actingPlayer !== state.guesser) break;
      if (state.powers.freezeSecretUsed) break;
      if (!state.firstSecretSet) break;

      state.powers.freezeSecretUsed = true;
      state.powers.freezeActive = true;
      break;
    }

    default:
      break;
  }
}

function finalizeFeedback(state) {
  if (!state.pendingGuess) {
    return;
  }

  const fbFull = scoreGuess(state.secret, state.pendingGuess);
  let hiddenIndex = null;

  if (state.powers.hideTilePending) {
    const positions = [0,1,2,3,4];
    hiddenIndex = positions[Math.floor(Math.random() * positions.length)];
    state.powers.hideTilePending = false;
  }

  state.history.push({
    guess: state.pendingGuess,
    fb: fbFull,
    hiddenIndex
  });

  state.guessCount++;
  // register guesser if missing (e.g., round where this is first completed guess)
  if (!state.roundStats[state.roundNumber].guesser) {
    state.roundStats[state.roundNumber].guesser = state.guesser;
  }

  state.pendingGuess = "";
  state.powers.freezeActive = false;
  state.turn = state.guesser;
}

// ----------------- SOCKET.IO -----------------

io.on("connection", (socket) => {
  console.log("new connection", socket.id);

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
    rooms[roomId].players[socket.id] = "A"; // first player = Player A

    console.log(`Room ${roomId} created by ${socket.id}`);

    if (cb) {
      cb({ roomId, playerRole: "A" });
    }

    // send initial state
    io.to(roomId).emit("stateUpdate", rooms[roomId].state);
  });

  socket.on("joinRoom", (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) {
      if (cb) cb({ ok: false, error: "Room not found" });
      return;
    }

    socket.join(roomId);

    // assign B if free, otherwise spectator
    let role = "B";
    const takenRoles = Object.values(room.players);
    if (takenRoles.includes("B")) {
      role = "spectator";
    }
    room.players[socket.id] = role;

    console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);

    if (cb) {
      cb({ ok: true, roomId, playerRole: role });
    }

    io.to(roomId).emit("stateUpdate", room.state);
  });

  socket.on("gameAction", ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room) return;

    const state = room.state;
    const role = room.players[socket.id] || "spectator";

    applyAction(state, action, role);

    io.to(roomId).emit("stateUpdate", state);
  });

  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    // clean up rooms
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        // if room empty, delete
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
          console.log(`Deleted empty room ${roomId}`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
