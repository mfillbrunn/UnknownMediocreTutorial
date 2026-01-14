// core/phases/gameOver.js

const { emitStateForAllPlayers } = require("../../utils/emitState");
const { emitLobbyEvent } = require("../../utils/emitLobby");
const { createInitialState } = require("../stateFactory");
const resetRoundState = require("../../utils/resetRoundState");
const {resetRoundTimer,stopTimer, startTimer} = require("../../utils/chessTimer");
const {applyRankedElo} = require("../../utils/elo");

function endGame(state, roomId, io, room, context) {
   const { supabase } = context; 
   let localGuesserDraft = "";
   state.turn = null;
   state.gameOver = true;
   if (state.timeControl?.enabled) {
      stopTimer(roomId);
      state.isTimerRunning = false;
   } 
   state.matchRounds = state.matchRounds || []; 
   if (state.powers.assassinated) {state.guessCount = state.guessCount + state.powers.assassinPoints;} 
   state.matchRounds.push({setter: state.setter, guesser: state.guesser, guessCount: state.guessCount,
       time: { A: state.timeUsed.A, B: state.timeUsed.B,}, timeoutLoser: state.timeoutLoser || null,
    history: state.history.map(x => ({ ...x })),
    powers: state.activePowers.map(x => ({ ...x })),
  });
    const res = state.mode?.onRoundEnd?.(state) || { view: "match", canNextRound: false };
    state.phase = "gameOver";
    state.gameOverView = res.view || "match"; 
    state.canNextRound = !!res.canNextRound;
  if (!state.canNextRound) {
     const {winner,tie} = computeMatchResult(state, null);
    if (state.ranked) {
      applyRankedElo({ state, room, supabase,winner,tie })
        .then(ratingChange => {return writeMatchHistory({state,room,supabase,ratingChange});})
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
    if (state.timeControl.enabled && !state.isTimerRunning) {
        stopTimer(roomId);
        resetRoundTimer(state);
        state.activeTimer = "both";
        state.roundStartTime = Date.now();
        startGameTimerSim(room, state, roomId, context)
        state.isTimerRunning=true;
      }
    state.gameOver = false;
    state.gameOverView = "match";
    state.canNextRound = false;
    state.phase = "simultaneous";    
    emitLobbyEvent(io, roomId, { type: "hideLobby" });
    emitStateForAllPlayers(roomId, room, io);
    return;
  }  
  ///NEW MATCH
if (action.type === "NEW_MATCH") {
  const names = state.playerNames;
  const fresh = createInitialState();
   for (const key of Object.keys(state)) {
     delete state[key];
   }
   Object.assign(state, fresh);
  state.phase = "lobby";
  state.ready = {};
  state.playerNames= names;
  // Re-sync roles with room.players
  for (const [playerId, player] of Object.entries(room.players)) {
    state.roles[playerId] = player.role;
  }
  state.setter = "A";
  state.guesser = "B";
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

   if (state.timeoutLoser) {
    winner = state.timeoutLoser === "A" ? "B" : "A";
    winReason = "timeout";
  } else {
    // Normal resolution
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
  }
  const didWin = winner && myRole === winner;
  const winnerPoints = winner ? points[winner] : points.A;
  const loserPoints = winner ? points[winner === "A" ? "B" : "A"] : points.A;
  return {
    points,
    time,
    winner,
    winReason,        
    didWin,
    winnerPoints,
    loserPoints
  };
}
async function writeMatchHistory({ state, room, supabase, ratingChange }) {
  const socketIds = Object.keys(room.players);
  if (socketIds.length !== 2) return;

  // Resolve sockets by role
  const socketA = socketIds.find(
    id => room.players[id]?.role === "A"
  );
  const socketB = socketIds.find(
    id => room.players[id]?.role === "B"
  );
  if (!socketA || !socketB) return;

  // Resolve USER IDs (critical)
  const userA = room.players[socketA].userId;
  const userB = room.players[socketB].userId;

  const {
    winner,
    winReason,
    winnerPoints,
    loserPoints
  } = computeMatchResult(state, null);

  const winnerUserId =
    winner === "A" ? userA :
    winner === "B" ? userB :
    null;

  const scoreA =
    winner === "A" ? winnerPoints :
    winner === "B" ? loserPoints :
    winnerPoints;

  const scoreB =
    winner === "B" ? winnerPoints :
    winner === "A" ? loserPoints :
    winnerPoints;

  const { error } = await supabase.from("matches").insert({
    mode: state.rankMode,
    ranked: state.ranked,

    player_a: userA,
    player_b: userB,

    winner: winnerUserId,
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

  if (error) {
    console.error("Match history insert failed:", error);
    throw error;
  }
}



module.exports = {handleGameOverPhase, endGame};
