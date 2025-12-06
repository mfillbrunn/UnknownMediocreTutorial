// setterPowers.js — CLEAN VERSION (no turn logic, no state reads)

window.setterPowerStatus = {
  hideTile: { used: false },
  reuseLetters: { used: false },
  confuseColors: { used: false },
  countOnly: { used: false }
};

// Called when clicking a setter power button
window.activateSetterPower = function (powerId, roomId) {
  const power = window.SETTER_POWERS[powerId];
  if (!power) return;

  // Prevent using "once" powers more than once (visual-side only)
  if (power.once && setterPowerStatus[powerId].used) return;

  // Send to server
  window.sendGameAction(roomId, { type: `USE_${powerId.toUpperCase()}` });

  // Mark visually used if once-only
  if (power.once) {
    setterPowerStatus[powerId].used = true;
    window.disableSetterPowerButton(powerId);
  }
};

// Disable a setter power button visually
window.disableSetterPowerButton = function (powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("power-used");
  }
};

// Reset all setter powers (visually) between rounds
window.resetSetterPowers = function () {
  for (const key in setterPowerStatus) {
    setterPowerStatus[key].used = false;
    const btn = document.getElementById(`power_${key}`);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("power-used");
    }
  }
};

// Render setter power buttons once
window.renderSetterPowerButtons = function (container) {
  if (!container) return;
  container.innerHTML = "";

  for (const key in window.SETTER_POWERS) {
    const p = window.SETTER_POWERS[key];
    const btn = document.createElement("button");
    btn.id = `power_${key}`;
    btn.textContent = p.label;
    btn.className = "power-btn";
    container.appendChild(btn);
  }
};
