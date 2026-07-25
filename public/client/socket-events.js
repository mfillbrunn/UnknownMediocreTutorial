
socket.on("simulProgress", ({ secretSubmitted, guessSubmitted }) => {
  // Notify BOTH players when setter submits (first time)
  if (secretSubmitted && !lastSimulSecret) {
    showSubmitBanner("spy", "Secret planted");
  }
  // Notify BOTH players when guesser submits (first time)
  if (guessSubmitted && !lastSimulGuess) {
    showSubmitBanner("inspector", "Guess in");
    // A guess adds to the SETTER's score (points = guesses it took to
    // find their secret), not the guesser's — the +1 has to pop on
    // whoever is setting this round, not whoever just guessed.
    window.showScorePop?.(window.state?.setter === myUserId());
  }
  // Save previous values so we don't re-show
  lastSimulSecret = secretSubmitted;
  lastSimulGuess = guessSubmitted;
  });
  socket.on("guessSubmitted", () => {
  showSubmitBanner("inspector", "Guess In");
  window.showScorePop?.(window.state?.setter === myUserId());
});
socket.on("secretPlanted", () => {
  showSubmitBanner("spy", "Secret Planted");
});
socket.on("setterRemainingBox", (boxState) => {
  renderSetterRemainingBox(boxState);
});

socket.on("setterLetterProfile", (stat) => {
  window.renderSetterLetterProfileBox?.(stat);
});

socket.on("revealOldSecret", ({ secret }) => {
  toast(`Secret three rounds ago was: ${secret.toUpperCase()}`);
});

// Private reward nudge for the setter: fires only when they actually
// changed their secret AND the new pick leaves strictly more remaining
// words than keeping the old one would have (see normal.js's SET_SECRET_NEW
// handler). Never sent to the guesser.
socket.on("secretChangeReward", ({ diff }) => {
  window.showSecretChangeRewardPop?.(diff);
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

  // Fallback for secret/guess errors the client didn't catch locally
  // (e.g. an inconsistent secret that slipped past the client check).
  // There is no #newSecretInput anymore — the setter types on the board —
  // so shake the actual draft rows of whichever role hit the error, and
  // reword the two known server codes to match the in-game wording.
  if (typeof shakeDraftRow === "function") {
    shakeDraftRow(window.myRole === "setter" ? "setter" : "guesser");
  }

  if (msg === "Incompatible with previous feedback" && window.myRole === "setter") {
    // state.setterDraft still holds the attempted word here — it's only
    // cleared on a SUCCESSFUL submit, and the server just rejected this one.
    const reasons = typeof explainSecretInconsistency === "function"
      ? explainSecretInconsistency(window.state?.history, window.state?.extraConstraints, window.state?.setterDraft)
      : [];
    window.showBigAnnounce?.({
      icon: "🚫",
      title: "Not consistent with prior feedback",
      sub: reasons.length ? reasons.slice(0, 2) : ["Doesn't match the clues given so far."],
      roleClass: "role-setter",
      duration: 2200,
      compact: true
    });
    window.clearSetterDraft?.();
    return;
  }

  const friendly =
    msg === "Incompatible with previous feedback"
      ? "Not consistent with prior feedback"
      : msg === "Word not in dictionary"
        ? "Not a valid secret"
        : msg;

  // Any other errorMessage the setter can hit is a rejected secret too
  // (only the setter's SET_SECRET_* actions land here; guess errors are
  // reported separately) -- same "don't backspace it by hand" treatment.
  if (window.myRole === "setter") window.clearSetterDraft?.();

  toast(friendly);
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
  joinRoom(code, {
    userId: window.currentUser.id,
    name: username
  }, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = code;
    persistRoom(roomId);
    enterLobbyAfterJoin();
  });
});

$("joinRoomInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("joinRoomBtn")?.click();
});

$("quickJoinBtn")?.addEventListener("click", () => {
  window.startQuickPlayHuman?.();
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
    // NEW_MATCH reuses this same room -- it never goes through clearRoom(),
    // which is the only other place this normally gets called -- so
    // without this, transient client-only UI state (an unsubmitted
    // guesser draft, tutorial highlight rings, cached power-picker state)
    // from the match that just ended silently carries into the new one.
    window.resetTransientGameUI?.();
    sendGameAction({ type: "NEW_MATCH" });
  }
});

$("shareResultBtn")?.addEventListener("click", async () => {
  const text = buildShareText(state, myRole);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Vowel Play result", text });
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
  // Unlimited-time rooms are meant to be stepped away from without losing
  // your spot — same "Leave" convention already used for an in-progress
  // unlimited game (see updateLeaveGameButtons/clearRoom). Emitting
  // leaveRoom here would strip your player entry from the room, which is
  // exactly what made it vanish from My Games — so for these, just stop
  // watching locally and leave the server-side room intact. Disconnect +
  // reconnect too (same fix as updateLeaveGameButtons' handler): clearRoom()
  // alone leaves this socket still subscribed to the room, so a later
  // broadcast (e.g. an AI opponent's move) would otherwise pull the player
  // right back into the live game.
  if (state?.timeControl?.enabled === false) {
    clearRoom();
    socket.disconnect();
    socket.connect();
    return;
  }

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
});
$("rankedLeaderboardBtn")?.addEventListener("click", () => {
  showScreen("leaderboardScreen");
  loadLeaderboard("bullet");
});

$("dailyBtn")?.addEventListener("click", () => {
  window.showDailyChallenge?.();
});

$("playVsAiBtn")?.addEventListener("click", () => {
  if (!requireAuth("play vs AI")) return;
  showScreen("vsAiScreen");
});

// VS AI difficulty selection (called from vsAiScreen inline onclick) --
// Developer > Play's manual path: creates the room and AI, then drops the
// player in the lobby to configure/ready up by hand.
window._startVsAI = function (difficulty) {
  if (!requireAuth("play vs AI")) return;
  window.rememberLastPlayMode?.({ mode: "ai", difficulty });
  const username = window.myProfile?.username || window.currentUser?.email || "Player";
  // Developer > Play's "Dev Mode" checkbox -- read before createRoom's
  // callback fires, same reasoning as startPlayFriend() in play-menu.js.
  const wantsDevMode = !!$("devModeCheckbox")?.checked;
  socket.emit("createRoom", { userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) return toast(resp?.error || "Could not create room");
    // roomId (bare) is the module-scoped variable client.js's power-button
    // render gate actually reads -- every other room-creation flow in this
    // file (createRoomBtn, joinRoomBtn, ranked match found) sets it too.
    // Setting only window.roomId here left it null, so onStateUpdate's
    // `roomId && myRole && ...` check for PowerEngine.renderButtons()
    // never passed, and the power buttons never got created for the whole
    // session -- reproducibly, every vs-AI game, only fixed by a reload.
    roomId = resp.roomId;
    window.roomId = resp.roomId;
    persistRoom(resp.roomId);
    sendGameAction({ type: "ADD_AI", difficulty, userId: window.currentUser.id });
    if (wantsDevMode) {
      sendGameAction({ type: "SET_DEV_MODE", userId: window.currentUser.id });
    }
    enterLobbyAfterJoin();
  });
};

// Quick Play -> "Play AI" (called from quickPlayAiScreen inline onclick):
// same room+AI setup as _startVsAI, but skips the lobby entirely -- draft
// mode (the server default), shuffle, and no timer are set up front and
// the host is marked ready immediately, so the match starts on its own the
// instant the room exists (PLAYER_READY only requires every HUMAN in the
// room to be ready, and there's just the one -- see lobby.js). The room
// still passes through state.phase === "lobby" for the brief span between
// createRoom and that PLAYER_READY landing -- window._quickAiStarting (see
// the matching guard in client.js's updateScreens()) keeps whatever screen
// is already showing (quickPlayAiScreen) up instead of flashing the real
// multiplayer lobby UI for that window, same fix as daily-challenge.js's
// _dailyStarting for the same reason.
window._startQuickAI = function (difficulty) {
  if (!requireAuth("play vs AI")) return;
  window.rememberLastPlayMode?.({ mode: "quickAi", difficulty });
  window._quickAiStarting = true;
  const username = window.myProfile?.username || window.currentUser?.email || "Player";
  socket.emit("createRoom", { userId: window.currentUser.id, name: username }, resp => {
    if (!resp?.ok) {
      window._quickAiStarting = false;
      return toast(resp?.error || "Could not create room");
    }
    // See the matching comment in _startVsAI above -- bare roomId is what
    // the power-button render gate in client.js actually reads.
    roomId = resp.roomId;
    window.roomId = resp.roomId;
    persistRoom(resp.roomId);
    const userId = window.currentUser.id;
    sendGameAction({ type: "ADD_AI", difficulty, userId });
    sendGameAction({ type: "SET_SHUFFLE", shuffle: true, userId });
    sendGameAction({ type: "SET_TIME_CONTROL", enabled: false, userId });
    sendGameAction({ type: "PLAYER_READY", userId });
    window.isRejoining = false;
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
let _prevDevMode = false;
function updateDevUI() {
  if (!devBtn || !state || !window.currentUser) return;
  const isDev = !!state.devMode;
  const isHost = state.hostUserId === window.currentUser.id;
  devBtn.classList.toggle("active", isDev);
  devBtn.disabled = !isHost;
  devBtn.textContent = isDev ? "Dev" : "Non-Dev";

  if (isDev && !_prevDevMode && isHost) {
    window.openDevPowersModal?.();
  }
  _prevDevMode = isDev;
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

// Shared by both the base-rules tutorial and the powers follow-up: create a
// fresh room, add the tutorial AI, make sure the human starts as guesser,
// then ready up tagged with the given mode ("tutorial" | "tutorial2") —
// lobby.js's PLAYER_READY handler reads that tag to set isTutorial/
// tutorialStage before TutorialMode.initMatch runs.
function startFreshTutorial(mode) {
  if (!requireAuth("start tutorial")) return;

  const username =
    window.myProfile?.username ||
    window.currentUser?.email ||
    "Player";

  createRoom(
    { name: username},
    resp => {
      if (!resp?.ok) return toast(resp?.error);

      // Not `const roomId` — that would shadow the shared global `roomId`
      // (declared in client.js) with a callback-local copy, leaving the
      // real one stuck at null for the rest of the session. Several things
      // key off it directly (e.g. PowerEngine's one-time button render
      // guard), not just window.roomId.
      roomId = resp.roomId;
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
          mode
        });
      }, 1);
    }
  );
  hide("startupScreen");
  hide("menu");
}

document.getElementById("startTutorialBtn")?.addEventListener("click", () => {
  startFreshTutorial("tutorial");
});

document.getElementById("startTutorial2Btn")?.addEventListener("click", () => {
  startFreshTutorial("tutorial2");
});

document.getElementById("showAdvancedTutorialBtn")?.addEventListener("click", () => {
  startFreshTutorial("advanced");
});

// Per-power "Try it" tutorial (Power Library "?" buttons). Unlike
// startFreshTutorial above, whether the human starts as guesser or setter
// depends on the power being taught -- a new room's host is setter by
// default, so only guesser powers need the SWITCH_ROLES step; setter
// powers start correctly with no switch at all. Round 1 has the human use
// the power themselves; round 2 (a normal end-of-round role swap, same
// mechanism as every other tutorial round transition) has the AI use the
// SAME power against them from the other side instead of any new "peek at
// the opponent's screen" machinery -- see runAI.js's maybeUsePower.
window.startPowerTutorial = function startPowerTutorial(powerId) {
  if (!requireAuth("start tutorial")) return;
  const meta = window.POWER_METADATA?.[powerId];
  if (!meta) return;

  const username =
    window.myProfile?.username ||
    window.currentUser?.email ||
    "Player";

  createRoom(
    { name: username },
    resp => {
      if (!resp?.ok) return toast(resp?.error);

      roomId = resp.roomId;
      persistRoom(roomId);
      window.roomId = roomId;

      sendGameAction({
        type: "ADD_AI",
        difficulty: 1,
        userId: window.currentUser.id
      });

      if (meta.role === "guesser") {
        setTimeout(() => {
          sendGameAction({ type: "SWITCH_ROLES", userId: window.currentUser.id });
        }, 1);
      }

      setTimeout(() => {
        sendGameAction({
          type: "PLAYER_READY",
          userId: window.currentUser.id,
          mode: "tutorialPower",
          powerId
        });
      }, 1);
    }
  );
  hide("startupScreen");
  hide("menu");
};

// "Continue to Tutorial 2" from tutorial 1's match-summary screen: reuse
// the SAME room/players (NEW_MATCH resets state but keeps the room and its
// players, including the AI) instead of leaving and recreating one. The
// human's role at that point is whatever tutorial 1's last round left them
// as (setter, after round 2's swap) — switch back to guesser so tutorial 2
// starts from the same role tutorial 1 did. Exposed as a function (rather
// than wired here) since the button is created dynamically by
// summary.js's renderMatchSummary(), which doesn't exist yet at page load.
window.continueToTutorial2 = function () {
  const userId = window.currentUser?.id;
  if (!userId) return;

  sendGameAction({ type: "NEW_MATCH", userId });

  setTimeout(() => {
    sendGameAction({ type: "SWITCH_ROLES", userId });
  }, 1);

  setTimeout(() => {
    sendGameAction({ type: "PLAYER_READY", userId, mode: "tutorial2" });
  }, 1);
};





