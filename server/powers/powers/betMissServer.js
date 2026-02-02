const engine = require("../powerEngineServer");
const {scoreGuess } = require("../../game-engine/scoring");

engine.registerPower("betMiss", {
  apply(state, action, roomId, io) {
    console.log("applied");
    if (state.powers.betMissUsed) return;
    console.log("postapplied");
    state.powers.betMissActive = true;
    state.powers.betMissUsed = true;
    state.powers.betMissNumber = action.betMissNumber;
    console.log(state.powers.betMissActive);
    io.to(roomId).emit("powerUsed", { type: "betMiss" });
  },
  postScore(state, entry, roomId, io) {
    console.log("[betMiss] postScore entered:", {
      roomId,
      turn: state.turn,
      setter: state.setter,
      betMissActive: state.powers?.betMissActive,
      betMissNumber: state.powers?.betMissNumber,
      fb: entry?.fb
    });
    if (!state.powers?.betMissActive || state.turn !== state.setter) {
    console.log("[betMiss] postScore exit: not active");
      return;
  }
     console.log("postscored");
  const betMissNumber = state.powers.betMissNumber;
  if (typeof betMissNumber !== "number" ||betMissNumber < 0 ||betMissNumber > 5) 
  {console.log("[betMiss] postScore exit: invalid betMissNumber", betMissNumber);return;}
  let misses = 0;
  const feedback = entry.fb;   
   for (let i = 0; i < 5; i++) {
        if (feedback[i] === "⬛") misses=misses+1;
      }    
     console.log("[betMiss] computed misses:", { betMissNumber, misses, feedback });
  if (betMissNumber === misses){
    console.log("[betMiss] BET SUCCESS");
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
    console.log("[betMiss] green reveal options:", options);
    if (!options.length) {console.log("[betMiss] no options left to reveal"); return ;}
    const index = options[Math.floor(Math.random() * options.length)];
    const letter = state.secret[index].toUpperCase();
    // Ensure constraints container exists
    state.extraConstraints ??= [];
    // Prevent duplicate reveals
    if (!state.extraConstraints.some(c => c.type === "GREEN" && c.index === index)) {
      state.extraConstraints.push({type: "GREEN",index,letter});
    }
    
  io.to(roomId).emit("betMiss", state.powers.betMissNumber );
    io.to(roomId).emit("toast", `Revealed letter ${letter} in position ${index + 1}!`);
  io.to(roomId).emit("toast", `Bet was ${betMissNumber}!`);
  } else{
      io.to(roomId).emit("toast", `Incorrect bet!`);
  }
  state.powers.betMissNumber = null;
  state.powers.betMissActive= false;
}
});
