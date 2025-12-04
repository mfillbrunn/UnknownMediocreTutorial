// /public/powers/setterPowers.js
// Client-side logic for SETTER powers

import { SETTER_POWERS } from "./powers.js";
import { sendGameAction } from "../network/socketClient.js";

// Track which powers have been used
export const setterPowerStatus = {
  hideTile: { used: false },
  reuseLetters: { used: false },
  confuseColors: { used: false },
  countOnly: { used: false }
};

export function activateSetterPower(powerId, roomId) {
  if (!SETTER_POWERS[powerId]) return;
  if (setterPowerStatus[powerId].used && SETTER_POWERS[powerId].once) return;

  sendGameAction(roomId, {
    type: `USE_${powerId.toUpperCase()}`
  });

  if (SETTER_POWERS[powerId].once) {
    setterPowerStatus[powerId].used = true;
    disablePowerButton(powerId);
  }
}

// Utility: disable a used button
export function disablePowerButton(powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.classList.add("power-used");
    btn.disabled = true;
  }
}

// Utility: reset all power buttons (when new round starts)
export function resetSetterPowers() {
  for (const key of Object.keys(setterPowerStatus)) {
    setterPowerStatus[key].used = false;
    const btn = document.getElementById(`power_${key}`);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("power-used");
    }
  }
}

// Render setter power buttons dynamically
export function renderSetterPowerButtons(container) {
  container.innerHTML = ""; // clear existing

  for (const key of Object.keys(SETTER_POWERS)) {
    const p = SETTER_POWERS[key];
    const btn = document.createElement("button");
    btn.id = `power_${key}`;
    btn.textContent = p.label;
    btn.className = "power-btn";

    container.appendChild(btn);
  }
}
