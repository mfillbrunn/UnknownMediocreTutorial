// setterPowers.js — NON-MODULE VERSION

window.setterPowerStatus = {
  hideTile: { used: false },
  reuseLetters: { used: false },
  confuseColors: { used: false },
  countOnly: { used: false }
};

window.activateSetterPower = function (powerId, roomId) {
  if (!window.SETTER_POWERS[powerId]) return;
  if (setterPowerStatus[powerId].used && window.SETTER_POWERS[powerId].once) return;

  window.sendGameAction(roomId, { type: `USE_${powerId.toUpperCase()}` });

  if (window.SETTER_POWERS[powerId].once) {
    setterPowerStatus[powerId].used = true;
    window.disableSetterPowerButton(powerId);
  }
};

window.disableSetterPowerButton = function (powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("power-used");
  }
};

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

window.renderSetterPowerButtons = function (container) {
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
