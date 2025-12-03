// /public/powers/guesserPowers.js
// Client-side logic for GUESSER powers

import { GUESSER_POWERS } from "./powers.js";

// Track guesser power usage
export const guesserPowerStatus = {
  revealGreen: { used: false },
  freezeSecret: { used: false }
};

// Called by client.js when a guesser presses a power button
export function activateGuesserPower(powerId, roomId, socket) {
  if (!GUESSER_POWERS[powerId]) return;
  if (guesserPowerStatus[powerId].used && GUESSER_POWERS[powerId].once) return;

  socket.emit("gameAction", {
    roomId,
    action: {
      type: `USE_${powerId.toUpperCase()}`
    }
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

    // Handlers will be attached in client.js
    container.appendChild(btn);
  }
}
