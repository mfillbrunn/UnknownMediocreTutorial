socket.on("simulProgress", ({ secretSubmitted, guessSubmitted }) => {

  // Notify BOTH players when setter submits (first time)
  if (secretSubmitted && !lastSimulSecret) {
    toast("Setter submitted their secret!");
  }
  // Notify BOTH players when guesser submits (first time)
  if (guessSubmitted && !lastSimulGuess) {
    toast("Guesser submitted their guess!");
  }
  // Save previous values so we don't re-toast
  lastSimulSecret = secretSubmitted;
  lastSimulGuess = guessSubmitted;
  });

socket.on("revealOldSecret", ({ secret }) => {
  toast(`Secret three rounds ago was: ${secret.toUpperCase()}`);
});


// Timer begins
socket.on("forceTimerStarted", ({ durationMs }) => {
  const seconds = Math.ceil(durationMs / 1000);
  toast(`⏱ Setter is now timed — ${seconds} seconds to make a guess!`);
});

socket.on("forceTimerExpired", () => {
  toast("Time ran out — old secret was kept!");
});


socket.on("errorMessage", msg => {
  if ($("assassinModal").classList.contains("active")) {
    const inp = $("assassinInput");
    shake(inp);
    toast(msg);
    inp.value = "";
    inp.focus(); // IMPORTANT to avoid “freeze”
    return;
  }

  // fallback for secret errors
  shake($("newSecretInput"));
  toast(msg);
});

socket.on("timerTick", ({ timeRemaining }) => {
  if (!window.state) return;

  // Update authoritative values
  window.state.timeRemaining = timeRemaining;

  // Re-render ONLY the clocks
  renderChessClocks();
});


/////////////////////////////////////////////////
////         LOBBY 
///////////////////////////////////////////////

socket.on("roleAssigned", ({ role }) => {
  myRole = role;
  roleAssigned = true;
    updateUI();
  updateRoleLabels();
});

$("createRoomBtn")?.addEventListener("click", () => {
  if (!requireAuth("create a room")) return;
  const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
createRoom(resp => {
  if (!resp.ok) return toast(resp.error);
  roomId = resp.roomId;
  persistRoom(roomId); // ✅ HERE
  enterLobbyAfterJoin();
}, {
  userId: window.currentUser.id,
  name: username
});

});



$("joinRoomBtn")?.addEventListener("click", () => {
  if (!requireAuth("join a room")) return;

  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return toast("Enter a code");
const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
joinRoom(code, resp => {
  if (!resp.ok) return toast(resp.error);
  roomId = code;
  persistRoom(roomId); // ✅ HERE
  enterLobbyAfterJoin();
}, {
  userId: window.currentUser.id,
  name: username
});

});

$("quickJoinBtn")?.addEventListener("click", () => {
  if (!requireAuth("quick play")) return;
const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
  quickJoin(payload, resp => {
  if (!resp.ok) return toast(resp.error);
  roomId = resp.roomId;
  persistRoom(roomId); // ✅ HERE
  enterLobbyAfterJoin();
});

});



$("switchRolesBtn")?.addEventListener("click", () => {
  sendGameAction({ type: "SWITCH_ROLES" , userId: window.currentUser.id});
});


$("readyBtn")?.addEventListener("click", () => {
  // Send to server
  //const name = $("playerNameInput")?.value?.trim() || "";
  const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
  sendGameAction({
    type: "PLAYER_READY",
    name: username,
    userId: window.currentUser.id
  });
});
$("applyPowerCountBtn")?.addEventListener("click", () => {
   const n = parseInt($("powerCountInput").value, 10);
   if (!isNaN(n) && n > 0 && n <= 10) {
     sendGameAction({ type: "SET_POWER_COUNT", count: n });
   }
});

document.addEventListener("click", e => {
  if (e.target?.id === "newMatchBtn") {
    sendGameAction({ type: "NEW_MATCH" });
  }
});

$("shareResultBtn")?.addEventListener("click", async () => {
  try {
    const text = buildShareText(state, myRole);
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard");
  } catch (err) {
    console.error("Clipboard copy failed:", err);
    toast("Could not copy result");
  }
});

$("kickSetterBtn")?.addEventListener("click", () => {
  socket.emit("kickPlayer", { roomId });
});

$("kickGuesserBtn")?.addEventListener("click", () => {
  socket.emit("kickPlayer", { roomId });
});

$("leaveRoomBtn")?.addEventListener("click", () => {
  socket.emit("leaveRoom", {}, () => {
    roomId = null;
    clearRoom();
    state = null;         
    window.state = null;
    showStartup();
  });
});

$("accountBtn").onclick = () => {
  document.body.classList.remove("menu-mode"); 
  showScreen("accountScreen");
  updateAccountUI(); 
};
$("backBtn").onclick = () => {
  showStartup(); // re-applies menu-mode correctly
};

socket.on("forceLeaveRoom", () => {
  console.warn("[forceLeaveRoom] Room closed by server");
  localStorage.removeItem("roomId");
  window.roomId = null;
  window.state = null;
  state = null;
  window.autoRejoinAttempted = true;
  clearRoom?.();
  showStartup?.();
  toast("The game has ended.");
});
$("rankedBadge")?.addEventListener("click", () => {
  if (!state || !window.currentUser) return;
  if (state.hostUserId !== window.currentUser.id) return;

  sendGameAction({
    type: "SET_RANKED",
    ranked: !state.ranked,
    userId: window.currentUser.id
  });
});


function updateRankedUI() {
  const badge = $("rankedBadge");
  if (!badge || !state || !window.currentUser) return;

  const isRanked = !!state.ranked;
  const isHost = state.hostUserId === window.currentUser.id;

  badge.textContent = isRanked ? "🏆 Ranked" : "🎮 Casual";

  // Preserve other classes
  badge.classList.toggle("ranked-on", isRanked);
  badge.classList.toggle("ranked-off", !isRanked);

  // Host-only interaction
  badge.classList.toggle("readonly", !isHost);
}


function onRejoinUI() {
  // Always leave startup/menu mode
  document.body.classList.remove("menu-mode");

  hide("startupScreen");
  hide("menu");

  // Show lobby or game based on state (stateUpdate will follow)
  show("lobby");
}

$("leaderboardBtn")?.addEventListener("click", () => {
  showScreen("leaderboardScreen");
  loadLeaderboard("bullet");
});

document.querySelectorAll(".concedeBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!confirm("Are you sure you want to concede the match?")) return;
    sendGameAction({ type: "CONCEDE" , userId: window.currentUser.id});
  });
});
function showAIDifficultyModal() {
  $("aiDifficultyModal")?.classList.add("active");
}
function hideAIDifficultyModal() {
  $("aiDifficultyModal")?.classList.remove("active");
}

$("addAiBtn")?.addEventListener("click", () => {
  showAIDifficultyModal();
});
document.querySelectorAll(".ai-option").forEach(btn => {
  btn.addEventListener("click", () => {
    const difficulty = Number(btn.dataset.difficulty);
    hideAIDifficultyModal();
    // Tell server to add AI with difficulty
    sendGameAction({type: "ADD_AI", difficulty: difficulty  , userId: window.currentUser.id});
  });
});

$("cancelAIModalBtn")?.addEventListener("click", hideAIDifficultyModal);
socket.on("rouletteSecretStart", ({ feasible }) => {
  // Only setter should animate
  if (myRole !== state.setter) return;

  startSecretRoulette(feasible);
});

document.getElementById("howToPlayBtn")?.addEventListener("click", () => {
  showTutorial();
});



