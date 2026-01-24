PowerEngine.register("assassinWord", {
  role: "setter",
  tooltip: {
    title: window.POWER_METADATA.assassinWord.label,
    desc: window.POWER_METADATA.assassinWord.desc
  },
  renderButton(roomId) {
  const { wrapper, btn } =    PowerEngine.createPowerButton("assassinWord", "Assassin Word");
  this.wrapperEl = wrapper;
  this.buttonEl = btn;
  $("setterPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      console.log("Assassin Word clicked");
      $("assassinInput").value = "";
      $("assassinModal").classList.add("active");
      $("assassinInput").focus();
      $("assassinSubmitBtn").dataset.roomId = roomId;
    };
  },

  uiEffects(state, role) {
  const btn = this.buttonEl;
  if (!btn) return;

  // Gate power button
  if (!state.activePowers?.includes("assassinWord")) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  btn.disabled = !!state.powers.assassinWordUsed;
},

  effects: {
    onPowerUsed() {
      const btn = this.buttonEl;
      if (!btn) return;
      btn.disabled = true;
      btn.classList.add("power-used");
    }
  },

  historyEffects(entry, isSetter) {
    if (entry.assassinTriggered && isSetter) {
      entry.fb = ["💀","💀","💀","💀","💀"];
      entry.fbGuesser = ["💀","💀","💀","💀","💀"];
    }
  }
});
document.addEventListener("DOMContentLoaded", () => {
// Modal handlers (OWNED BY THIS POWER)
$("assassinSubmitBtn").onclick = () => {
  const roomId = $("assassinSubmitBtn").dataset.roomId;
  const word = $("assassinInput").value.trim();
  if (!word) return;

  sendGameAction({
    type: "USE_ASSASSIN_WORD",
    word
  });

  $("assassinModal").classList.remove("active");
};

$("assassinCancelBtn").onclick = () => {
  $("assassinModal").classList.remove("active");
  $("assassinInput").value = "";
};
});

// --------------------------------------------------
// Assassin Word — info badge (setter-only, persistent)
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.assassinWordUsed) {return null;}
  const meta = POWER_METADATA.assassinWord;
  
  // Assassin word exists?
  const assassin = state.powers?.assassinWord;

  // -----------------------------
  // SETTER: show the actual word
  // -----------------------------
  if (role === state.setter) {
    return {
      id: "assassinWord-setter",
      emoji: meta.emoji,
      text: `${meta.label}: ${assassin.toUpperCase()}`,
      color: meta.color,
      priority: 2,
      screen: "setter",
      details: meta.desc
    };
  }

  // -----------------------------
  // GUESSER: generic warning only
  // -----------------------------
  if (role === state.guesser) {
    return {
      id: "assassinWord-guesser",
      emoji: meta.emoji,
      text: `${meta.label} active`,
      color: meta.color,
      priority: 8,
      screen: "guesser",
      details: "One word will instantly end the game if guessed."
    };
  }

  return null;
});
