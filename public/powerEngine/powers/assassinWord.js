// /public/powerEngine/powers/assassinWord.js

PowerEngine.register("assassinWord", {
  role: "setter",

  // No (state, role) parameters -> Option B
  renderButton(roomId) {
    const btn = document.createElement("button");
    btn.className = "power-btn";
    btn.textContent = "Assassin Word";
    btn.style.display = "none"; // ← CRITICAL LINE
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
  let el = document.getElementById("assassinWordDisplay");
  if (!el) {
    el = document.createElement("div");
    el.id = "assassinWordDisplay";

    // Pretty styling
    el.style.marginTop = "8px";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "8px";
    el.style.fontWeight = "600";
    el.style.display = "inline-block";
    el.style.fontSize = "14px";
    el.style.color = "white";
    el.style.background = "linear-gradient(135deg, #8b0000, #cc0000)";
    el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
    el.style.letterSpacing = "0.5px";
    el.style.opacity = "0";           // fade in when active
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

  historyEffects(entry, isSetter) {
    if (entry.assassinTriggered && isSetter) {
      entry.fb = ["💀","💀","💀","💀","💀"];
      entry.fbGuesser = ["💀","💀","💀","💀","💀"];
    }
  }
});
// Attach once when the script loads
$("assassinSubmitBtn").onclick = () => {
    const roomId = $("assassinSubmitBtn").dataset.roomId;
    const word = $("assassinInput").value.trim();

    if (!word) return;

    // Send power action to server
    socket.emit("action", {
        type: "USE_ASSASSIN_WORD",
        word
    });

    // Close modal
    $("assassinModal").classList.remove("active");
};
