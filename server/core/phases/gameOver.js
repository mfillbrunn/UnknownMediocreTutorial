// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");

function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;

  // --------------------------------------------------------------------
  // The only valid action in gameOver is NEW_MATCH
  // --------------------------------------------------------------------
  
  if (action.type === "NEXT_ROUND") {
+    if (!state.canNextRound || state.gameOverView !== "round") {
+      return; // ignore if not allowed
+    }
+
+    // Let the mode decide role swapping, power persistence, next phase, etc.
+    // Expected return shape:
+    // { phase: "simultaneous"|"normal", resetRound: true|false }
+    const res = state.mode?.onNextRound?.(state) || {
+      phase: "simultaneous",
+      resetRound: true
+    };
+
+    if (res.resetRound) {
+      resetRoundState(state);
+    }
+
+    state.gameOver = false;
+    state.gameOverView = "match";
+    state.canNextRound = false;
+    state.phase = res.phase || "simultaneous";
+    state.turn = null;
+
+    emitLobbyEvent(io, roomId, { type: "hideLobby" });
+    emitStateForAllPlayers(roomId, room, io);
+    return;
+  }  
  if (action.type === "NEW_MATCH") {
     const fresh = createInitialState();
  Object.assign(state, fresh);
  
  // Assign setter/guesser based on current room.players roles (A/B)
  state.setter = "A";
  state.guesser = "B";


    // Re-enter lobby
    state.phase = "lobby";
    state.ready = { A: false, B: false };

    emitLobbyEvent(io, roomId, { type: "showLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }

  // --------------------------------------------------------------------
  // All other actions are ignored during gameOver
  // --------------------------------------------------------------------
  return;
}

module.exports = handleGameOverPhase;
