
socket.on("simulProgress", ({ secretSubmitted, guessSubmitted }) => {
  // Notify BOTH players when setter submits (first time)
  if (secretSubmitted && !lastSimulSecret) {
    showSubmitBanner("spy", "Secret planted");
  }
  // Notify BOTH players when guesser submits (first time)
  if (guessSubmitted && !lastSimulGuess) {
    showSubmitBanner("inspector", "Guess in");
  }
  // Save previous values so we don't re-show
  lastSimulSecret = secretSubmitted;
  lastSimulGuess = guessSubmitted;
  });
socket.on("secretFound", () => {
  showSystemBanner("Secret Found");
});
  socket.on("guessSubmitted", () => {
  showSubmitBanner("inspector", "Guess In");
});
socket.on("secretPlanted", () => {
  showSubmitBanner("spy", "Secret Planted");
});
socket.on("gameStart", () => {
  showSystemBanner("Game Started");
});
socket.on("setterRemainingBox", (boxState) => {
  renderSetterRemainingBox(boxState);
});

socket.on("revealOldSecret", ({ secret }) => {
  toast(`Secret three rounds ago was: ${secret.toUpperCase()}`);
});

// Timer begins
socket.on("forceTimerStarted", ({ durationMs }) => {
  const seconds = Math.ceil(durationMs / 1000);
  toast(`⏱ Spy is now timed — ${seconds} seconds to make a guess!`);
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
  window.myRole = role;
  roleAssigned = true;
  persistLastGameInfo({
    role,
    opponentName: window.opponentName ?? null,
    startedAt: Date.now()
  });
    updateUI();
  updateRoleLabels();
});
function persistLastGameInfo(info) {
  localStorage.setItem("lastGameInfo", JSON.stringify(info));
}
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

  const payload = {
    userId: window.currentUser.id,
    name: username
  };

  quickJoin(payload, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;
    persistRoom(roomId);
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
  if (e.target?.closest?.("#newMatchBtn")) {
    resetKeyboards();
    sendGameAction({ type: "NEW_MATCH" });
  }
});

$("shareResultBtn")?.addEventListener("click", async () => {
  const text = buildShareText(state, myRole);
  if (navigator.share) {
    try {
      await navigator.share({ title: "VS Wordle result", text });
      return;
    } catch { /* user cancelled or share failed — fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied to clipboard");
  } catch {
    toast("Could not share result");
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
    resetKeyboards();
    showStartup();
  });
});

$("rejoinConfirmBtn")?.addEventListener("click", () => {
  $("rejoinModal")?.classList.remove("active");
  tryAutoRejoin();
});

$("rejoinLeaveBtn")?.addEventListener("click", () => {
  $("rejoinModal")?.classList.remove("active");
  window.autoRejoinAttempted = true; // don't re-prompt for this room

  const finish = () => {
    roomId = null;
    clearRoom();
    state = null;
    window.state = null;
    resetKeyboards();
    showStartup();
  };

  if (socket.connected) {
    socket.emit("leaveRoom", {}, finish);
  } else {
    finish();
  }
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

$("accountLeaderboardBtn")?.addEventListener("click", () => {
  showScreen("leaderboardScreen");
  loadLeaderboard("bullet");
});

$("dailyBtn")?.addEventListener("click", () => {
  window.showDailyChallenge?.();
});

$("accountFriendsBtn")?.addEventListener("click", () => {
  window.showFriendsScreen?.();
});

$("playVsAiBtn")?.addEventListener("click", () => {
  if (!requireAuth("play vs AI")) return;
  showScreen("vsAiScreen");
});

// VS AI difficulty selection (called from vsAiScreen inline onclick)
window._startVsAI = function (difficulty) {
  if (!requireAuth("play vs AI")) return;
  window.rememberLastPlayMode?.({ mode: "ai", difficulty });
  const username = window.myProfile?.username || window.currentUser?.email || "Player";
  socket.emit("createRoom", { userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) return toast(resp?.error || "Could not create room");
    window.roomId = resp.roomId;
    persistRoom(resp.roomId);
    sendGameAction({ type: "ADD_AI", difficulty, userId: window.currentUser.id });
    enterLobbyAfterJoin();
  });
};

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
const devBtn = document.querySelector("#devBtn");
 devBtn?.addEventListener("click", () => {
  sendGameAction({
    type: "SET_DEV_MODE",
    dev_mode: !state.devMode,
    userId: window.currentUser.id
  });
});
function updateDevUI() {
  if (!devBtn || !state || !window.currentUser) return;
  const isDev = !!state.devMode;
  const isHost = state.hostUserId === window.currentUser.id;
  devBtn.classList.toggle("active", isDev);
  devBtn.disabled = !isHost;
  devBtn.textContent = isDev ? "Dev" : "Non-Dev";
}
const shuffleBtn = document.querySelector("#shuffle");
shuffleBtn?.addEventListener("click", () => {
  sendGameAction({
    type: "SET_SHUFFLE",
    shuffle: !state.shuffle,
    userId: window.currentUser.id
  });
});
function updateShuffleUI() {
  if (!shuffleBtn || !state || !window.currentUser) return;
  const isShuffle = !!state.shuffle;
  const isHost = state.hostUserId === window.currentUser.id;
  shuffleBtn.classList.toggle("active", isShuffle);
  shuffleBtn.disabled = !isHost;
  shuffleBtn.textContent = isShuffle ? "🔀 Shuffle" : "Non-Shuffle";
}


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
  if (myUserId() !== state.setter) return;

  startSecretRoulette(feasible);
});

document.getElementById("startTutorialBtn")?.addEventListener("click", () => {
  if (!requireAuth("start tutorial")) return;

  const username =
    window.myProfile?.username ||
    window.currentUser?.email ||
    "Player";

  createRoom(
    { name: username},
    resp => {
      if (!resp?.ok) return toast(resp?.error);

      const roomId = resp.roomId;
      persistRoom(roomId);
      window.roomId = roomId;

      // Step 1: Add AI (level 1)
      sendGameAction({
        type: "ADD_AI",
        difficulty: 1,
        userId: window.currentUser.id
      });

      // Step 2: Switch roles so human is guesser
      setTimeout(() => {
        sendGameAction({ type: "SWITCH_ROLES" ,
        userId: window.currentUser.id});
      }, 1);

      // Step 3: Ready human
      setTimeout(() => {
        sendGameAction({
          type: "PLAYER_READY",
          userId: window.currentUser.id,
          mode: "tutorial" 
        });
      }, 1);
    }
  );
  hide("startupScreen");
  hide("menu");
});





