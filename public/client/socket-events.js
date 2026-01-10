window.getUserId = function () {
  return window.currentUser?.id || null;
};
function persistRoom(roomId) {
  localStorage.setItem("roomId", roomId);
}

function clearRoom() {
  localStorage.removeItem("roomId");
}


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

///FORCE GUESS
socket.on("forceGuessOptions", ({ options }) => {
  if (myRole !== state.setter) return;

  const modal = $("forceGuessModal");
  const container = $("forceGuessOptionsContainer");
  container.innerHTML = "";

  options.forEach(o => {
    const btn = document.createElement("button");
    btn.className = "primary-btn small";

    btn.textContent = formatForceGuessOption(o);

    btn.onclick = () => {
      sendGameAction(roomId, {
        type: "CONFIRM_FORCE_GUESS",
        mode: o.type
      });
    };

    container.appendChild(btn);
  });

  modal.classList.add("active");
});

socket.on("timerTick", ({ timeRemaining }) => {
  if (!window.state) return;

  // Update authoritative values
  window.state.timeRemaining = timeRemaining;

  // Re-render ONLY the clocks
  renderChessClocks();
});

socket.on("connect", () => {
  console.log("🔌 Connected");

  const roomId = localStorage.getItem("roomId");
  const userId = window.getUserId();

  // Only auto-rejoin if authenticated
  if (roomId && userId) {
    socket.emit(
      "joinRoom",
      { roomId, userId },
      res => {
        if (!res?.ok) {
          console.warn("Auto-rejoin failed:", res?.error);
          clearRoom();
        } else {
          console.log(
            "♻️ Rejoined room",
            roomId,
            res.reattached ? "(reattached)" : "(joined)"
          );
        }
      }
    );
  }
  roomId = roomIdFromStorage;
  $("roomCodeLabel").textContent = roomId;
});




/////////////////////////////////////////////////
////         LOBBY 
///////////////////////////////////////////////

socket.on("roleAssigned", ({ role }) => {
  myRole = role;
  roleAssigned = true;
     localGuesserDraft = "";
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
}, {
  userId: window.currentUser.id,
  name: username
});

});

window.quickJoin = function (payload, cb) {
  socket.emit("quickJoin", payload, cb);
};

$("quickJoinBtn")?.addEventListener("click", () => {
  if (!requireAuth("quick play")) return;
const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
  quickJoin(
    {
      userId: window.currentUser.id,
      name: username
    },
    resp => {
      if (!resp.ok) return toast(resp.error);
      roomId = resp.roomId;
    }
  );
});



$("switchRolesBtn")?.addEventListener("click", () => {
  sendGameAction(roomId, { type: "SWITCH_ROLES" });
});


$("readyBtn")?.addEventListener("click", () => {
  // Send to server
  //const name = $("playerNameInput")?.value?.trim() || "";
  const username =
  window.myProfile?.username ||
  window.currentUser?.email ||
  "Player";
  sendGameAction(roomId, {
    type: "PLAYER_READY",
    name: username,
    userId: window.currentUser.id
  });

  // Immediately update UI locally
  //enableReadyButton(false);
});
$("applyPowerCountBtn")?.addEventListener("click", () => {
   const n = parseInt($("powerCountInput").value, 10);
   if (!isNaN(n) && n > 0 && n <= 10) {
     sendGameAction(roomId, { type: "SET_POWER_COUNT", count: n });
   }
});

$("newMatchBtn")?.addEventListener("click", () => {
  sendGameAction(roomId, { type: "NEW_MATCH" });
  const el = $("assassinWordDisplay");
if (el) el.textContent = "";
  hide("setterScreen");
  hide("guesserScreen");
  show("menu");
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
    showStartup();
  });
});

$("accountBtn").onclick = () => showScreen("accountScreen");
$("backBtn").onclick = () => showScreen("startupScreen");

socket.on("forceLeaveRoom", () => {
  roomId = null;
  state = null;
  showStartup();
  toast("You were removed from the room.");
});

$("rankedToggle").onchange = e => {
  sendGameAction(roomId, {
    type: "SET_RANKED",
    ranked: e.target.checked
  });
};
function updateRankedUI() {
  const badge = $("rankedBadge");
  const toggle = $("rankedToggle");
  const wrapper = $("rankedToggleWrapper");
  if (!badge || !toggle || !state) return;

  const isRanked = !!state.ranked;
  const isHost = state.host === socket.id;

  // 🔹 Everyone sees the status
  badge.textContent = isRanked ? "🏆 Ranked" : "🎮 Casual";
  badge.className = isRanked ? "ranked-on" : "ranked-off";

  // 🔹 Only host can interact
  toggle.checked = isRanked;
  toggle.disabled = !isHost;

  // Optional: visually dim toggle for non-hosts
  wrapper.classList.toggle("readonly", !isHost);
}
$("rankedToggle")?.addEventListener("change", e => {
  sendGameAction(roomId, {
    type: "SET_RANKED",
    ranked: e.target.checked
  });
});


