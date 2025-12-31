const {startTimer } = require("./chessTimer");
const { endGame } = require("../core/phases/normal");
const { handleRoundTimeout } = require("./roundTimer");

function startGameTimer(roomId, room, state, context) {
  const io = context.io;

  startTimer(roomId, state, io, timedOutRole => {
    if (state.timeControl.mode === "chess") {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room);
      return;
    }
    handleRoundTimeout(room, state, roomId, context, timedOutRole);
  });
}

module.exports = {
  startGameTimer
};
