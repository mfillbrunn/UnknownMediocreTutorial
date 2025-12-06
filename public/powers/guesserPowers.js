// guesserPowers.js — CLEAN VERSION (no turn logic, no state reads)

window.guesserPowerStatus = {
  revealGreen: { used: false },
  freezeSecret: { used: false }
};

// Called when clicking a guesser power button
window.activateGuesserPower = function (powerId, roomId) {
  const power = window.GUESSER_POWERS[powerId];
  if (!power) return;

  // Once-per-game restriction (visual only)
  if (power.once && guesserPowerStatus[powerId].used) return;

  // Send to server
  window.sendGameAction(roomId, { type: `USE_${powerId.toUpperCase()}` });

  // Mark visually used if once-only
  if (power.once) {
    guesserPowerStatus[powerId].used = true;
    window.disableGuesserPowerButton(powerId);
  }
};

// Disable visually
window.disableGuesserPowerButton = function (powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("power-used");
  }
};

// Reset visually (between new matches)
window.resetGuesserPowers = function () {
  for (const key in guesserPowerStatus) {
    guesserPowerStatus[key].used = false;
    const btn = document.getElementById(`power_${key}`);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("power-used");
    }
  }
};

// Render guesser power buttons once
window.renderGuesserPowerButtons = function (container) {
  if (!container) return;
  container.innerHTML = "";

  for (const key in window.GUESSER_POWERS) {
    const p = window.GUESSER_POWERS[key];
    const btn = document.createElement("button");
    btn.id = `power_${key}`;
    btn.textContent = p.label;
    btn.className = "power-btn";
    container.appendChild(btn);
  }
};
