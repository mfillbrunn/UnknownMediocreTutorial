// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");

function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;

  // --------------------------------------------------------------------
  // The only valid action in gameOver is NEW_MATCH
  // --------------------------------------------------------------------
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
