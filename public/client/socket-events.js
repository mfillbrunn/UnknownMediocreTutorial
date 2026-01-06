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


/////////////////////////////////////////////////
////         LOBBY 
///////////////////////////////////////////////

document
  .querySelectorAll('input[name="timePreset"]')
  .forEach(radio => {
    radio.addEventListener("change", () => {
      const v = radio.value;

      if (v === "none") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: false
        });
      }

      if (v === "bullet") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 60
        });
      }

      if (v === "blitz") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "round",
          seconds: 180
        });
      }

      if (v === "deep") {
        sendGameAction(roomId, {
          type: "SET_TIME_CONTROL",
          enabled: true,
          mode: "chess",
          seconds: 900
        });
      }
    });
  });


socket.on("roleAssigned", ({ role }) => {
  myRole = role;
  roleAssigned = true;
     localGuesserDraft = "";
  if (pendingState) {
    state = pendingState;
    window.state = state;
    pendingState = null;
    updateUI();
  }
  updateRoleLabels();
});


// -----------------------------------------------------
// BUTTONS
// -----------------------------------------------------
(function setupConstraintToggle() {
  const buttons = document.querySelectorAll(".constraint-toggle-btn");
  if (!buttons.length) return;

  // Load saved preference (default: visible)
  const hidden = localStorage.getItem("hideConstraints") === "true";
  document.body.classList.toggle("hide-constraints", hidden);

  buttons.forEach(btn => {
    btn.classList.toggle("off", hidden);

    btn.onclick = () => {
      const isHidden = document.body.classList.toggle("hide-constraints");
      localStorage.setItem("hideConstraints", isHidden);

      // Keep all buttons in sync
      buttons.forEach(b => b.classList.toggle("off", isHidden));
    };
  });
})();

function enableReadyButton(enabled) {
  const btn = $("readyBtn");
  if (!btn) return;
  btn.disabled = !enabled;
  if (!enabled) {
    btn.classList.add("waiting");
    btn.textContent = "Waiting...";
  } else {
    btn.classList.remove("waiting");
    btn.textContent = "I'm Ready";
  }
}

$("createRoomBtn")?.addEventListener("click", () => {
  createRoom(resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = resp.roomId;
  });
});

$("joinRoomBtn")?.addEventListener("click", () => {
  const code = $("joinRoomInput").value.trim().toUpperCase();
  if (!code) return toast("Enter a code");

  joinRoom(code, resp => {
    if (!resp.ok) return toast(resp.error);
    roomId = code;
  });
});

window.quickJoin = function (cb) {
  socket.emit("quickJoin", cb);
};

$("quickJoinBtn")?.addEventListener("click", () => {
  quickJoin(resp => {
    if (!resp.ok) return toast(resp.error);

    roomId = resp.roomId;
  });
});

$("switchRolesBtn")?.addEventListener("click", () => {
  sendGameAction(roomId, { type: "SWITCH_ROLES" });
});


$("readyBtn")?.addEventListener("click", () => {
  // Send to server
  //const name = $("playerNameInput")?.value?.trim() || "";
  
  sendGameAction(roomId, {
    type: "PLAYER_READY",
    name: getPlayerName()
  });

  // Immediately update UI locally
  enableReadyButton(false);
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

$("quickPlayBtn")?.addEventListener("click", () => {
  quickJoin(resp => {
    if (resp.ok) {
      roomId = resp.roomId;
      enterLobbyAfterJoin();
      return;
    }

    // No room available → create one
    createRoom(resp2 => {
      if (!resp2.ok) {
        toast(resp2.error || "Could not start game");
        return;
      }

      roomId = resp2.roomId;
      enterLobbyAfterJoin();
    });
  });
});

function isHost() {
  return state && state.host === myRole;
}
function updateTimerPresetUI() {
  if (!state?.timeControl) return;

  const { enabled, mode, seconds } = state.timeControl;

  let preset = "none";
  if (enabled && mode === "round" && seconds === 60) preset = "bullet";
  if (enabled && mode === "round" && seconds === 180) preset = "blitz";
  if (enabled && mode === "chess" && seconds === 900) preset = "deep";

  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(r => {
      r.checked = r.value === preset;
    });
}

function updateTimerAccess() {
  const host = state.host;

  document
    .querySelectorAll('input[name="timePreset"]')
    .forEach(input => {
      input.disabled = !host;
    });

  document
    .querySelectorAll('.timer-option')
    .forEach(opt => {
      opt.classList.toggle("disabled", !host);
    });
}
function updateHostControls() {
  if (!state) return;

  const hostRole = state.host;
  const meHost = isHost();

  // Host badge
  $("setterHostBadge")?.classList.toggle(
    "hidden",
    hostRole !== "A"
  );
  $("guesserHostBadge")?.classList.toggle(
    "hidden",
    hostRole !== "B"
  );

  // Kick buttons (host only, opponent only)
  $("kickSetterBtn")?.classList.toggle(
    "hidden",
    !meHost || hostRole === "A"
  );
  $("kickGuesserBtn")?.classList.toggle(
    "hidden",
    !meHost || hostRole === "B"
  );
}

