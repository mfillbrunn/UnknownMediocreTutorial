const {startTimer } = require("./chessTimer");
const { endGame } = require("../core/phases/normal");
const { handleRoundTimeout } = require("./roundTimer");

function startGameTimer(room, state, roomId, context) {
  const io = context.io;

  startTimer(roomId, state, io, timedOutRole => {
    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room);
      return;
    }

    const res = handleRoundTimeout(
      room,
      state,
      roomId,
      timedOutRole,
      context
    );

    // 🔁 restart timer only if game continues
    if (res?.shouldContinue) {
      startGameTimer(room, state, roomId, context);
    }
  });
}

module.exports = { startGameTimer };;
