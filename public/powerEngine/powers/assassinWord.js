// /public/powerEngine/powers/assassinWord.js

PowerEngine.register("assassinWord", {
  role: "setter",

  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    $("setterPowerContainer").appendChild(btn);

    btn.onclick = () => {
      $("assassinInput").value = "";
      $("assassinModal").classList.add("active");
      $("assassinInput").focus();

      // Save roomId into DOM so submit button knows what to send
      $("assassinSubmitBtn").dataset.roomId = roomId;
    };
  },

  uiEffects(state, role) {
    if (role !== state.setter) return;

    let el = document.getElementById("assassinWordDisplay");
    if (!el) {
      el = document.createElement("div");
      el.id = "assassinWordDisplay";
      el.style.marginTop = "8px";
      el.style.fontWeight = "bold";
      document.getElementById("setterSecretArea").appendChild(el);
    }

    el.textContent = state.powers.assassinWord
      ? "Assassin Word: " + state.powers.assassinWord
      : "";
  }
});


  historyEffects(entry, isSetter) {
    if (entry.assassinTriggered && isSetter) {
      entry.fb = ["💀","💀","💀","💀","💀"];
      entry.fbGuesser = ["💀","💀","💀","💀","💀"];
    }
  }
});
