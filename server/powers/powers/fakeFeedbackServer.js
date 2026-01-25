// /powers/powers/fakeFeedback.js
const engine = require("../powerEngineServer.js");
const { isConsistentWithHistory } = require("../../game-engine/history");
const { scoreGuess } = require("../../game-engine/scoring");


engine.registerPower("fakeFeedback", {
  apply(state, action, roomId, io) {
    if (state.powers.fakeFeedbackUsed) return;
    state.powers.fakeFeedbackUsed = true;
    state.powers.fakeFeedbackActive = true;
    const fakesecret = global.ALLOWED_SECRETS.filter(secret =>isConsistentWithHistory(state.history, secret, state));
    if (fakesecret.length <= 1) {
      state.powers.fakeFeedbackSecret = state.secret;
    } else{
      do {
        state.powers.fakeFeedbackSecret = fakesecret[Math.floor(Math.random() * fakesecret.length)];
      } while (state.powers.fakeFeedbackSecret === state.secret);
    }    
   io.to(roomId).emit("powerUsed", { type: "fakeFeedback" });
  },
 postScore(state, entry) {
   if (!state.powers.fakeFeedbackActive) {return;}
   const real  = scoreGuess(state.secret, state.pendingGuess);
   const fake = scoreGuess(state.powers.fakeFeedbackSecret, state.pendingGuess);
 if (Math.random()>0.5){
   entry.fakeFeedback = {
    real,   // ["🟩","⬛",...]
    fake    // ["🟨","⬛",...]
  };
 }else{
      entry.fakeFeedback = {
    fake,   // ["🟩","⬛",...]
    real    // ["🟨","⬛",...]
  };
 }
   entry.fbGuesser = ["?","?","?","?","?"];
 }
});
