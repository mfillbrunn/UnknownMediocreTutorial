// /public/powers/guesserPowers.js
// Client-side logic for GUESSER powers

import { GUESSER_POWERS } from "./powers.js";
import { sendGameAction } from "../network/socketClient.js";

// Track guesser power usage
export const guesserPowerStatus = {
  revealGreen: { used: false },
  freezeSecret: { used: false }
};

export function activateGuesserPower(powerId, roomId) {
  if (!GUESSER_POWERS[powerId]) return;
  if (guesserPowerStatus[powerId].used && GUESSER_POWERS[powerId].once) return;

  sendGameAction(roomId, {
    type: `USE_${powerId.toUpperCase()}`
  });

  if (GUESSER_POWERS[powerId].once) {
    guesserPowerStatus[powerId].used = true;
    disableGuesserPowerButton(powerId);
  }
}

// Mark a button as used
export function disableGuesserPowerButton(powerId) {
  const btn = document.getElementById(`power_${powerId}`);
  if (btn) {
    btn.classList.add("power-used");
    btn.disabled = true;
  }
}

// Reset powers (called on new round)
export function resetGuesserPowers() {
  for (const key of Object.keys(guesserPowerStatus)) {
    guesserPowerStatus[key].used = false;
    const btn = document.getElementById(`power_${key}`);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("power-used");
    }
  }
}

// Render guesser power buttons dynamically
export function renderGuesserPowerButtons(container) {
  container.innerHTML = "";

  for (const key of Object.keys(GUESSER_POWERS)) {
    const p = GUESSER_POWERS[key];
    const btn = document.createElement("button");
    btn.id = `power_${key}`;
    btn.textContent = p.label;
    btn.className = "power-btn";

    container.appendChild(btn);
  }
}
