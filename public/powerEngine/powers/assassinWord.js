// /public/powerEngine/powers/assassinWord.js

PowerEngine.register("assassinWord", {
  role: "setter",

  // No (state, role) parameters -> Option B
  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    this.buttonEl = btn;

    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      // Open modal — but this does NOT mean power will succeed yet
      $("assassinInput").value = "";
      $("assassinModal").classList.add("active");
      $("assassinInput").focus();

      $("assassinSubmitBtn").dataset.roomId = roomId;
    };
  },

  uiEffects(state, role) {
    // Option B: hide/update the DISPLAY only, not the button
    let el = document.getElementById("assassinWordDisplay");
    if (!el) {
      el = document.createElement("div");
      el.id = "assassinWordDisplay";
      el.style.marginTop = "8px";
      el.style.fontWeight = "bold";
      document.getElementById("setterSecretArea").appendChild(el);
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
