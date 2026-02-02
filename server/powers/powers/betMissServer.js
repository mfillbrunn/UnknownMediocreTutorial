const engine = require("../powerEngineServer");
const {scoreGuess } = require("../../game-engine/scoring");

engine.registerPower("betMiss", {
  apply(state, action, roomId, io) {
    console.log("applied");
    if (state.powers.betMissUsed) return;
    state.powers.betMissActive = true;
    state.powers.betMissUsed = true;
    io.to(roomId).emit("powerUsed", { type: "betMiss" });
  },
  postScore(state, entry, roomId) {
  console.log("postscored before");
    console.log( state.powers.betMissActive);
    console.log(state.turn );
    console.log(state.setter );
    if (!state.powers?.betMissActive || state.turn !== state.setter) {
    return;
  }
     console.log("postscored");
  const betMissNumber = state.powers.betMissNumber;
  if (typeof betMissNumber !== "number" ||betMissNumber < 0 ||betMissNumber > 5) return;
  let misses = 0;
  const feedback = entry.fb;   
   for (let i = 0; i < 5; i++) {
        if (feedback[i] === "⬛") misses=misses+1;
      }    
  if (betMissNumber === misses){
    const greenPositions = new Set();
    for (const past of state.history) {
      if (!past?.fb) continue;
      for (let i = 0; i < 5; i++) {
        if (past.fb[i] === "🟩") greenPositions.add(i);
      }
    }
    for (const c of state.extraConstraints ?? []) {
      if (c.type === "GREEN") {
        greenPositions.add(c.index);
      }
    }
    const options = [0,1,2,3,4].filter(i => !greenPositions.has(i));
    if (!options.length) return ;
    const index = options[Math.floor(Math.random() * options.length)];
    const letter = state.secret[index].toUpperCase();
    // Ensure constraints container exists
    state.extraConstraints ??= [];
    // Prevent duplicate reveals
    if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
      state.extraConstraints.push({type: "GREEN",index,letter});
    }
    
  io.to(roomId).emit("betMiss", {betMissNumber });
    io.to(roomId).emit("toast", `Revealed letter ${letter} in position ${index + 1}!`);
  io.to(roomId).emit("toast", `Bet was ${betMissNumber}!`);
  } else{
      io.to(roomId).emit("toast", `Incorrect bet!`);
  }
  state.powers.betMissNumber = null;
  state.powers.betMissActive= false;
}
});
