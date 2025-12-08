// index.js — Updated for Modular Power Engine

const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

// ------------------------------
// Load server power engine
// ------------------------------
const powerEngine = require("./powers/powerEngineServer");

// Register all server-side powers
require("./powers/powers/hideTileServer");
require("./powers/powers/reuseLettersServer");
require("./powers/powers/confuseColorsServer");
require("./powers/powers/countOnlyServer");
require("./powers/powers/revealGreenServer");
require("./powers/powers/freezeSecretServer");

// ------------------------------


const app = express();
const server = http.createServer(app);

app.get("/api/allowed-guesses", (req, res) => {
  res.json(ALLOWED_GUESSES);
});
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
// Game engine modules
// ------------------------------
const { scoreGuess } = require("./game-engine/scoring.js");
const { isConsistentWithHistory } = require("./game-engine/history.js");
const { isValidWord, parseWordlist } = require("./game-engine/validation.js");

// --------------------------------------
let ALLOWED_GUESSES = [];
try {
  const raw = fs.readFileSync("./wordlists/allowed_guesses.txt", "utf8");
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
    guessCount: 0,
    gameOver: false,
    history: [],
    simultaneousGuessSubmitted: false,
    simultaneousSecretSubmitted: false,
    powerUsedThisTurn: false,
    powers: {
      hideTileUsed: false,
      hideTilePendingCount: 0,
      revealGreenUsed: false,
      revealGreenPos: null,
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
//---
// Security leaks
//---
const { buildSafeStateForPlayer } = require("./utils/safeState");
function emitStateForAllPlayers(roomId, room, io) {
  for (const [playerId, role] of Object.entries(room.players)) {
    const safe = buildSafeStateForPlayer(room.state, role);
    io.to(playerId).emit("stateUpdate", safe);
  }
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
  // 1) Let powers modify BEFORE scoring
  powerEngine.preScore(state, guess);
  // 2) Base scoring
  const fb = scoreGuess(state.secret, guess);
  // 3) Build history entry
  const entry = {
    guess,
    fb,
    fbGuesser: [...fb], // default identical
    extraInfo: null,
    finalSecret: state.secret
  };
  // 4) Let powers modify AFTER scoring (feedback/entry edits)
  powerEngine.postScore(state, entry);
  // 5) Save entry
  state.history.push(entry);
  // 6) Cleanup
  state.pendingGuess = "";
  state.guessCount++;
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
  console.log(">> ACTION RECEIVED", action.type, {
  role,
  phase: state.phase,
  turn: state.turn,
  pendingGuess: state.pendingGuess
});
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
    const r = role;
    state.ready[r] = true;
    emitLobby(roomId, { type: "playerReady", role: r });
    if (state.ready.A && state.ready.B) {
      state.phase = "simultaneous";
      state.turn = null;
      state.pendingGuess = "";
      state.simultaneousGuessSubmitted = false;
      state.simultaneousSecretSubmitted = false;
      emitLobby(roomId, { type: "hideLobby" });
      emitStateForAllPlayers(roomId, room, io);
       }
          return;
  }
  // ---------------------
  // NEW MATCH
  // ---------------------
  if (action.type === "NEW_MATCH") {
  // Reset game state but KEEP roles A/B
  const oldSetter = state.setter;
  const oldGuesser = state.guesser;
  Object.assign(state, createInitialState());
  // Restore manual roles
  state.setter = oldSetter;
  state.guesser = oldGuesser;
  // Reset ready flags
  state.ready = { A: false, B: false };
  // Return to lobby phase
  state.phase = "lobby";
  // Tell clients to show lobby UI again
  emitLobby(roomId, { type: "showLobby" });
  emitStateForAllPlayers(roomId, room, io);
  return;
}
  // ---------------------
  // POWERS
  // ---------------------
 if (action.type.startsWith("USE_")) {
  const powerId = action.type.replace("USE_", "").toLowerCase();
  if (state.phase === "simultaneous") return;
  if (state.powerUsedThisTurn) return;
  state.powerUsedThisTurn = true;
  powerEngine.applyPower(powerId, state, action, roomId, io);
  return;
}
  // ===================================================================
  // PHASE: SIMULTANEOUS
  // ===================================================================
  if (state.phase === "simultaneous") {
    // Setter submits initial secret
    if (action.type === "SET_SECRET_NEW" && role === state.setter) {
      if (state.simultaneousSecretSubmitted) return;
      const w = action.secret.toLowerCase();
      if (!isValidWord(w, ALLOWED_GUESSES)) return;
      state.secret = w;
      state.simultaneousSecretSubmitted = true;
      state.firstSecretSet = true;  
    }
    // Guesser submits initial guess
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      if (state.simultaneousGuessSubmitted) return;
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;
      state.pendingGuess = g;
      state.simultaneousGuessSubmitted = true;
    }
    // When both have acted → move to start of NORMAL phase
  if (state.secret && state.pendingGuess) {
    state.phase = "normal";
    state.turn = state.setter;   // setter must decide first
    emitStateForAllPlayers(roomId, room, io);
}
    return;
  }
  // ===================================================================
  // PHASE: NORMAL
  //   pendingGuess exists → setter responds SAME/NEW
  //   pendingGuess empty → guesser submits new guess
  // ===================================================================
  if (state.phase === "normal") {
    if (state.turn === state.setter) {
  console.log("[SETTER ACTION RECEIVED]", action.type, {
    role,
    turn: state.turn,
    setter: state.setter,
    secret: state.secret,
    pendingGuess: state.pendingGuess,
    historyLen: state.history.length
  });
}
    // ------------------------------------------------
    //  CASE 1 — SETTER DECISION STEP
    // ------------------------------------------------
    if (state.turn === state.setter) {
      // Setter chooses NEW secret
         if (action.type === "SET_SECRET_NEW") {
           if (powerEngine.beforeSetterSecretChange(state, action)) {
  console.log("[BLOCKED] beforeSetterSecretChange");
  return;
}
            const w = action.secret.toLowerCase();
            if (!isValidWord(w, ALLOWED_GUESSES)) {
  console.log("[BLOCKED] invalid word", w);
  return;
}
           if (!isConsistentWithHistory(state.history, w)) {
  console.log("[BLOCKED] inconsistent with history", w, state.history);
  return;
}
            state.secret = w;    
            // If setter picks secret == guess → instant win
            if (state.pendingGuess === w) {
              state.history.push({
                guess: w,
                fb: ["🟩","🟩","🟩","🟩","🟩"],
                fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
                extraInfo: null,
                finalSecret: w
              });          
              state.phase = "gameOver";
              state.turn = null;
              state.gameOver = true;
              io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
              emitStateForAllPlayers(roomId, room, io);
              emitLobby(roomId, { type: "gameOverShowMenu" });
              return;
            }
        }
      // Setter chooses SAME secret
      else if (action.type === "SET_SECRET_SAME") {
        if (powerEngine.beforeSetterSecretChange(state, action)) return;
        if (!isConsistentWithHistory(state.history, state.secret)) return;
        // If SAME = guess → instant win
        if (state.pendingGuess === state.secret) {
          state.history.push({
            guess: state.secret,
            fb: ["🟩","🟩","🟩","🟩","🟩"],
            fbGuesser: ["🟩","🟩","🟩","🟩","🟩"],
            extraInfo: null,
            finalSecret: state.secret
          });      
          state.phase = "gameOver";
          state.turn = null;
          state.gameOver = true;      
          io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
          emitStateForAllPlayers(roomId, room, io);      
          emitLobby(roomId, { type: "gameOverShowMenu" });
          return;
        }
      }
      // Score guess & update history
      finalizeFeedback(state);
      // Next → guesser's turn
      state.turn = state.guesser;
      state.powerUsedThisTurn = false;
      emitStateForAllPlayers(roomId, room, io);
      return;
    }

    // ------------------------------------------------
    // ⭐ CASE 2 — GUESSER'S TURN (NO pendingGuess)
    // ------------------------------------------------
    if (action.type === "SUBMIT_GUESS" && role === state.guesser) {
      const g = action.guess.toLowerCase();
      if (!isValidWord(g, ALLOWED_GUESSES)) return;
      // Win
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
        emitStateForAllPlayers(roomId, room, io);
        emitLobby(roomId, { type: "gameOverShowMenu" });
        return;
      }
      // Otherwise → store pending guess, setter must decide
      state.pendingGuess = g;
      state.turn = state.setter;
      state.powerUsedThisTurn = false;
      emitStateForAllPlayers(roomId, room, io);
      return;
    }
    return;
  }

  // ===================================================================
  // PHASE: gameOver
  // ===================================================================
  if (state.phase === "gameOver") return;
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
    emitStateForAllPlayers(roomId, rooms[roomId], io);
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
    emitStateForAllPlayers(roomId, room, io);
  });

  // GAME ACTION
socket.on("gameAction", ({ roomId, action }) => {
  const room = rooms[roomId];
  if (!room) return;

  const role = room.players[socket.id];
  if (!role) return;

  action.playerId = socket.id;
  action.role = role;

  applyAction(room, room.state, action, role, roomId);
   // --- Simultaneous phase — only send state when BOTH actions are submitted
    if (room.state.phase === "simultaneous") {
    
      // Always send update to keep inputs reactive
     emitStateForAllPlayers(roomId, room, io);
    
      // If both players have not submitted, stop here → NO second broadcast
      if (!(room.state.secret && room.state.pendingGuess)) return;
    }
    
    // Normal phase → single broadcast
    emitStateForAllPlayers(roomId, room, io);

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
setInterval(() => {
  for (const [roomId, room] of Object.entries(rooms)) {
    if (Object.keys(room.players).length === 0) {
      console.log("Cleaning empty room:", roomId);
      delete rooms[roomId];
    }
  }
}, 1000 * 60 * 10); // every 10 minutes
server.listen(PORT, () => console.log("VS Wordle server running on", PORT));
