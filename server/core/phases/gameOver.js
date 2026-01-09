// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {resetRoundTimer,stopTimer, startTimer} = require("../../utils/chessTimer");
const {applyRankedElo} = require("../../utils/elo");

function endGame(state, roomId, io, room, context) {
   const { supabase } = context; 
   state.turn = null;
   state.gameOver = true;
   if (state.timeControl?.enabled) {
      stopTimer(roomId);
      state.isTimerRunning = false;
   } 
   state.matchRounds = state.matchRounds || []; 
   state.matchRounds.push({
    setter: state.setter,
    guesser: state.guesser,
    guessCount: state.guessCount,
       time: {
    A: state.timeUsed.A,
    B: state.timeUsed.B,
       },
         timeoutLoser: state.timeoutLoser || null,
    history: JSON.parse(JSON.stringify(state.history)),
    powers: JSON.parse(JSON.stringify(state.activePowers || [])),
  });
    const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
    state.phase = "gameOver";
    state.gameOverView = res.view || "match"; 
    state.canNextRound = !!res.canNextRound;
  if (!state.canNextRound) {
    if (state.ranked) {
      applyRankedElo({ state, room, supabase })
        .then(ratingChange => {
          return writeMatchHistory({
            state,
            room,
            supabase,
            ratingChange
          });
        })
        .catch(err => console.error("Ranked match persistence failed:", err));
    }else {
       writeMatchHistory({ state, room, supabase })
      .catch(err => console.error("Match history write failed:", err));
     }
    emitLobbyEvent(io, roomId, { type: "gameOverShowMenu" });
    io.to(roomId).emit("animateTurn", { type: "guesserSubmitted" });
    emitStateForAllPlayers(roomId, room, io)
}
}
function handleGameOverPhase(room, state, action, role, roomId, context) {
  const io = context.io;
   ///NEXT ROUND
  if (action.type === "NEXT_ROUND") {
    if (!state.canNextRound || state.gameOverView !== "round") {return;}
    const res = state.mode?.onNextRound?.(state) || {phase: "simultaneous",resetRound: true};
    if (res.resetRound) {
      resetRoundState(state);
    }
   if (state.timeControl.enabled && !state.isTimerRunning) {
        resetRoundTimer(state);
        state.activeTimer = "both";
        state.roundStartTime = Date.now();
        stopTimer(roomId);
        startGameTimerSim(room, state, roomId, context)
        state.isTimerRunning=true;
      }
    state.gameOver = false;
    state.gameOverView = "match";
    state.canNextRound = false;
    state.phase = res.phase || "simultaneous";
    state.turn = null;
    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }  
        ///NEW MATCH
      if (action.type === "NEW_MATCH") {
        names = state.playerNames;
        const fresh = createInitialState();
        Object.assign(state, fresh);
        state.setter = "A";
        state.guesser = "B";
        state.phase = "lobby";
        state.ready = {};
         state.playerNames= names;
        // Re-sync roles with room.players
        for (const [playerId, role] of Object.entries(room.players)) {
          state.roles[playerId] = role;
        }
        emitStateForAllPlayers(roomId, room, io);
        return;
      }

  return;
}

function startGameTimerSim(room, state, roomId, context) {
  const io = context.io;
  startTimer(roomId, state, io, timedOutRole => {
      state.timeoutLoser = timedOutRole;
      endGame(state, roomId, io, room,context);
      return;
  });
}

function computeMatchResult(state, myRole) {
  const rounds = state.matchRounds || [];

  const points = { A: 0, B: 0 };
  const time = { A: 0, B: 0 };

  rounds.forEach(r => {
    points[r.setter] += r.guessCount;
    time.A += r.time?.A || 0;
    time.B += r.time?.B || 0;
  });

  let winner = null;
  let winReason = "points";

  if (points.A > points.B) {
    winner = "A";
  } else if (points.B > points.A) {
    winner = "B";
  } else if (time.A !== time.B) {
    winner = time.A <= time.B ? "A" : "B";
    winReason = "time";
  } else {
    winReason = "tie";
  }

  const didWin = winner && myRole === winner;

  const winnerPoints = winner ? points[winner] : points.A;
  const loserPoints = winner ? points[winner === "A" ? "B" : "A"] : points.A;

  const resultIcon =
    winReason === "tie" ? "↔️" : didWin ? "🏆" : "❌";

  return {
    points,
    time,
    winner,
    winReason,        
    didWin,
    winnerPoints,
    loserPoints,
    resultIcon
  };
}
async function writeMatchHistory({ state, room, supabase, ratingChange }) {
  const playerA = Object.keys(room.players).find(id => room.players[id] === "A");
  const playerB = Object.keys(room.players).find(id => room.players[id] === "B");
  if (!playerA || !playerB) return;

  const { winner, winReason, winnerPoints, loserPoints } =
    computeMatchResult(state, null);

  const winnerId =
    winner === "A" ? playerA :
    winner === "B" ? playerB :
    null;

  const scoreA =
    winner === "A" ? winnerPoints :
    winner === "B" ? loserPoints :
    winnerPoints;

  const scoreB =
    winner === "B" ? winnerPoints :
    winner === "A" ? loserPoints :
    winnerPoints;

  await supabase.from("matches").insert({
    mode: state.rankMode,
    ranked: state.ranked,

    player_a: playerA,
    player_b: playerB,

    winner: winnerId,
    win_reason: winReason,

    score_a: scoreA,
    score_b: scoreB,
    rating_a_before: ratingChange?.rating_a_before ?? null,
    rating_b_before: ratingChange?.rating_b_before ?? null,
    rating_a_after: ratingChange?.rating_a_after ?? null,
    rating_b_after: ratingChange?.rating_b_after ?? null,
    
     time_control: {
      enabled: state.timeControl?.enabled,
      mode: state.timeControl?.mode,
      roundSeconds: state.timeControl?.roundSeconds,
      initialSeconds: state.timeControl?.initialSeconds,
      incrementSeconds: state.timeControl?.incrementSeconds,
      rankMode: state.rankMode
    },

    rounds: JSON.parse(JSON.stringify(state.matchRounds))
  });
}


module.exports = {handleGameOverPhase, endGame};
