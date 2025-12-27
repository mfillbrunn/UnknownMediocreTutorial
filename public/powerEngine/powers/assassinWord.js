PowerEngine.register("assassinWord", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    this.buttonEl = btn;

    $("setterPowerContainer").appendChild(btn);

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

  // -----------------------------
  // Assassin badge (setter only)
  // -----------------------------
  const badge = $("assassinWordBadge");
  if (!badge) return;

  if (
    role === state.setter &&
    state.powers.assassinWord
  ) {
    badge.textContent =
      "☠ Assassin Word: " +
      state.powers.assassinWord.toUpperCase();
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
,

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

  sendGameAction(roomId, {
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
