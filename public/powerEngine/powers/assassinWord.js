PowerEngine.register("assassinWord", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    this.buttonEl = btn;

    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      $("assassinInput").value = "";
      $("assassinModal").classList.add("active");
      $("assassinInput").focus();
      $("assassinSubmitBtn").dataset.roomId = roomId;
    };
  },

  uiEffects(state) {
    const btn = this.buttonEl;
    if (!btn) return;

    // Gate visibility
    if (!state.activePowers?.includes("assassinWord")) {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";

    // Display assassin word for setter
    let el = document.getElementById("assassinWordDisplay");
    if (!el) {
      el = document.createElement("div");
      el.id = "assassinWordDisplay";
      el.style.marginTop = "8px";
      el.style.padding = "6px 10px";
      el.style.borderRadius = "8px";
      el.style.fontWeight = "600";
      el.style.fontSize = "14px";
      el.style.color = "white";
      el.style.background = "linear-gradient(135deg, #8b0000, #cc0000)";
      el.style.opacity = "0";
      el.style.transition = "opacity 0.3s";
      document.getElementById("setterSecretArea").appendChild(el);
    }

    if (state.powers.assassinWord) {
      el.textContent = "☠ Assassin Word: " + state.powers.assassinWord.toUpperCase();
      el.style.opacity = "1";
    } else {
      el.textContent = "";
      el.style.opacity = "0";
    }
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
