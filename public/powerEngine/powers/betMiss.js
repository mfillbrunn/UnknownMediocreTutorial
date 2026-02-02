PowerEngine.register("betMiss", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.betMiss.label,
    desc: window.POWER_METADATA.betMiss.desc
  },
  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("betMiss", window.POWER_METADATA.betMiss.label);
  this.wrapperEl = wrapper;
  this.buttonEl = btn;
  $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      console.log("bet Miss clicked");
      $("betMissInput").value = "";
      $("betMissModal").classList.add("active");
      $("betMissInput").focus();
      $("betMissSubmitBtn").dataset.roomId = roomId;
    };
  },

  uiEffects(state, role) {
  const btn = this.buttonEl;
  if (!btn) return;

  // Gate power button
  if (!state.activePowers?.includes("betMiss")) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  btn.disabled = !!state.powers.betMiss;
},

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  }
});
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".bet-btn");
  const input = $("betMissInput");
  const confirmBtn = $("betMissSubmitBtn");

  // -----------------------------
  // Number button selection (0–5)
  // -----------------------------
  buttons.forEach(btn => {
    btn.onclick = () => {
      // Clear previous selection
      buttons.forEach(b => b.classList.remove("selected"));

      // Select current
      btn.classList.add("selected");
      input.value = btn.dataset.value;

      // Enable confirm
      confirmBtn.disabled = false;
    };
  });

  // -----------------------------
  // Confirm
  // -----------------------------
  confirmBtn.onclick = () => {
    const value = input.value;
    if (value === "") return;

    sendGameAction({
      type: "USE_BET_MISS",
      betMissNumber: Number(value)
    });

    $("betMissModal").classList.remove("active");
  };

  // -----------------------------
  // Cancel
  // -----------------------------
  $("betMissCancelBtn").onclick = () => {
    $("betMissModal").classList.remove("active");
    input.value = "";
    confirmBtn.disabled = true;
    buttons.forEach(b => b.classList.remove("selected"));
  };
});


// --------------------------------------------------
// Bet Miss — info badge 
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.betMissUsed) {return null;}
  const meta = POWER_METADATA.betMiss;
  
  // Bet number exists?
  const betMissNumber = state.powers?.betMissNumber;

  // -----------------------------
  // Guesser: show the actual bet
  // -----------------------------
  if (role === state.guesser) {
    return {
      id: "betMiss-guesser",
      emoji: meta.emoji,
      text: `${meta.label}: ${betMissNumber}`,
      color: meta.color,
      priority: 2,
      screen: "guesser",
      details: meta.desc
    };
  }

  // -----------------------------
  // Setter: generic warning only
  // -----------------------------
  if (role === state.setter) {
    return {
      id: "betMiss-setter",
      emoji: meta.emoji,
      text: `${meta.label} active`,
      color: meta.color,
      priority: 8,
      screen: "setter",
      details: "The guesser bet how many misses this next guess will have."
    };
  }

  return null;
});
