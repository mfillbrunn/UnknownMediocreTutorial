// /public/powerEngine/powers/assassinWord.js

PowerEngine.register("assassinWord", {
  role: "setter",

 renderButton(roomId, state, role) {
  // 1. Only setter should see button
  if (role !== state.setter) return;

  // 2. Only show if assassinWord is in active powers
  if (!state.activePowers.includes("assassinWord")) return;

  // 3. Only show if power is allowed right now
  const rule = POWER_RULES.assassinWord;
  if (!rule.allowed(state, role)) return;

  // 4. Build button normally
  const btn = document.createElement("button");
  btn.className = "power-btn";
  btn.textContent = "Assassin Word";
  $("setterPowerContainer").appendChild(btn);

  btn.onclick = () => {
    $("assassinInput").value = "";
    $("assassinModal").classList.add("active");
    $("assassinInput").focus();

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
      document
        .getElementById("setterSecretArea")
        .appendChild(el);
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
