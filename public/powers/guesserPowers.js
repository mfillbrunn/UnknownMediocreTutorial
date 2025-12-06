// guesserPowers.js — NON-MODULE VERSION

window.guesserPowerStatus = {
  revealGreen: { used: false },
  freezeSecret: { used: false }
};

window.activateGuesserPower = function (powerId, roomId) {
  if (!window.GUESSER_POWERS[powerId]) return;
  if (guesserPowerStatus[powerId].used && window.GUESSER_POWERS[powerId].once) return;

  window.sendGameAction(roomId, { type: `USE_${powerId.toUpperCase()}` });

  if (window.GUESSER_POWERS[powerId].once) {
    guesserPowerStatus[powerId].used = true;
    window.disableGuesserPowerButton(powerId);
  }
};

window.disableGuesserPowerButton = function (powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("power-used");
  }
};

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

window.renderGuesserPowerButtons = function (container) {
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
