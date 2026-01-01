/// TOOLTIPS
///

let activeTooltipTarget = null;
let latestPowerInfoState = null;

window.updatePowerInfoState = function (state) {
  if (state && state.activePowers) {
    latestPowerInfoState = state;
  }
};

function buildPowerInfoPanel(state, role) {
  const panel = document.getElementById(
    role === "setter"
      ? "powerInfoPanelSetter"
      : "powerInfoPanelGuesser"
  );

  if (!panel || !state) return;

  panel.innerHTML = "";

  const sections = {
    setter: [],
    guesser: []
  };

  for (const id in PowerEngine.powers) {
    if (state.activePowers && !state.activePowers.includes(id)) continue;

    const mod = PowerEngine.powers[id];
    const meta = getPowerMeta(id);
    if (!meta) continue;

    const row = document.createElement("div");
    row.className = "power-info-row";

    row.innerHTML = `
      <div class="power-info-title">${meta.label}</div>
      <div class="power-info-desc">${meta.desc}</div>
    `;

    const powerRole = mod.role || "guesser";
    sections[powerRole]?.push(row);
  }

  if (sections.setter.length) {
    panel.appendChild(makeInfoHeader("Setter Powers"));
    sections.setter.forEach(r => panel.appendChild(r));
  }

  if (sections.guesser.length) {
    panel.appendChild(makeInfoHeader("Guesser Powers"));
    sections.guesser.forEach(r => panel.appendChild(r));
  }
}

function makeInfoHeader(text) {
  const h = document.createElement("div");
  h.className = "power-info-header";
  h.textContent = text;
  return h;
}


function showTooltip(target, { title, desc }) {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  activeTooltipTarget = target;

  tooltip.innerHTML = `
    <div class="tooltip-title">${title}</div>
    <div class="tooltip-desc">${desc}</div>
  `;

  const rect = target.getBoundingClientRect();
  const padding = 8;

  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - padding}px`;

  tooltip.hidden = false;

  requestAnimationFrame(() => {
    tooltip.classList.add("show");
  });
}

function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  activeTooltipTarget = null;

  tooltip.classList.remove("show");

  setTimeout(() => {
    // Only hide if nothing else reactivated it
    if (!activeTooltipTarget) {
      tooltip.hidden = true;
    }
  }, 150); // must match CSS transition
}



// powerEngine.js (or a shared client helper)
window.getPowerMeta = function (id, variant) {
  const base = window.POWER_METADATA[id];
  if (!base) return null;

  if (variant && base.variants?.[variant]) {
    return base.variants[variant];
  }
  return base;
};

document.addEventListener("mousemove", (e) => {
  if (!activeTooltipTarget) return;

  const rect = activeTooltipTarget.getBoundingClientRect();
  const inside =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;

  if (!inside) {
    hideTooltip();
  }
});

window.addEventListener("scroll", hideTooltip);
window.addEventListener("resize", hideTooltip);

$("timeControlSelect").onchange = () => {
  const select = $("timeControlSelect");
  const seconds = parseInt(select.value, 10);

  if (!Number.isFinite(seconds)) return;

  // No time selected
  if (seconds === 0) {
    sendGameAction(roomId, {
      type: "SET_TIME_CONTROL",
      enabled: false
    });
    return;
  }

  const mode =
    select.selectedOptions[0].dataset.mode || "round";

  sendGameAction(roomId, {
    type: "SET_TIME_CONTROL",
    enabled: true,
    mode,
    seconds
  });
};


document.addEventListener("DOMContentLoaded", () => {
  const infoBtn = document.getElementById("powerInfoBtn");
  const panel = document.getElementById("powerInfoPanel");

  if (!infoBtn || !panel) return;

  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const isOpen = !panel.hidden;
    panel.hidden = isOpen;

    if (!isOpen) {
      if (latestPowerInfoState) {
        buildPowerInfoPanel(latestPowerInfoState);
      }
    }
  });

  // Close when tapping outside
  document.addEventListener("click", (e) => {
    if (
      !panel.hidden &&
      !panel.contains(e.target) &&
      e.target !== infoBtn
    ) {
      panel.hidden = true;
    }
  });
});
function initPowerInfoButton(buttonId, role) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(
    role === "setter"
      ? "powerInfoPanelSetter"
      : "powerInfoPanelGuesser"
  );

  if (!btn || !panel) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();

    const isOpen = !panel.hidden;
    panel.hidden = isOpen;

    if (!isOpen && latestPowerInfoState) {
      buildPowerInfoPanel(latestPowerInfoState, role);
    }
  });

  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });
}
