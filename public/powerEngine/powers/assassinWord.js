// /powers/powers/assassinWord.js
PowerEngine.register("assassinWord", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    this.buttonEl = btn;
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      const w = prompt("Enter assassin word:");
      if (!w) return;
      sendGameAction(roomId, {
  type: "USE_ASSASSIN_WORD",
  word: w,
  playerId: socket.id   // IMPORTANT
});
    };
  },

  uiEffects(state, role) {
    if (role !== state.setter) return;

    const area = document.getElementById("setterSecretArea");
    if (!area) return;

    let el = document.getElementById("assassinWordDisplay");
    if (!el) {
      el = document.createElement("div");
      el.id = "assassinWordDisplay";
      el.style.marginTop = "8px";
      el.style.fontWeight = "bold";
      area.appendChild(el);
    }

    if (state.powers.assassinWord) {
      el.textContent = "Assassin Word: " + state.powers.assassinWord;
    } else {
      el.textContent = "";
    }
  },

  historyEffects(entry, isSetter) {
    if (entry.assassinTriggered && isSetter) {
      entry.fb = ["💀","💀","💀","💀","💀"];
      entry.fbGuesser = ["💀","💀","💀","💀","💀"];
    }
  }
});
