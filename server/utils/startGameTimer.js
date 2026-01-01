const { startTimer } = require("./chessTimer");
const {  endGame, handleRoundTimeout} = require("../core/phases/normal");

function startGameTimer(room, state, roomId, context) {
  const io = context.io;

  startTimer(roomId, state, io, timedOutRole => {
    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room);
      return;
    }

    const shouldContinue =
      handleRoundTimeout(room, state, roomId, timedOutRole, context);

    if (shouldContinue) {
      startGameTimer(room, state, roomId, context);
    }
  });
}

module.exports = { startGameTimer };
