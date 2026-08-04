/// TOOLTIPS
///
const ENABLE_POWER_TOOLTIPS = false;
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

  // Only the powers actually active this game — not the full library of
  // every power that could exist.
  const activePowers = new Set(state.activePowers || []);

  const sections = { setter: [], guesser: [] };

  for (const id in PowerEngine.powers) {
    if (!activePowers.has(id)) continue;

  const mod =
  PowerEngine.powers[id];

const powerRole =
  mod.role || "guesser";

const variant =
  state.powers?.[id]?.mode || null;

const meta =
  getPowerMeta(id, variant);

if (!meta) {
  continue;
}

const description =
  powerRole === role
    ? meta.desc
    : (
        meta.opponentDesc ||
        meta.short ||
        meta.desc
      );

const row =
  document.createElement("div");

row.className =
  "power-info-row power-info-active";

row.innerHTML = `
  <span class="power-info-emoji">
    ${meta.emoji || "⚡"}
  </span>

  <div class="power-info-body">
    <div class="power-info-title">
      ${meta.label}
    </div>

    <div class="power-info-desc">
      ${description}
    </div>
  </div>
`;

sections[powerRole]?.push(row);
  }

  // Quest isn't a registered PowerEngine power (it piggybacks on the power
  // dispatch loop purely server-side, see questServer.js), so the loop above
  // never sees it. It's the guesser's own objective, so it's listed under
  // Inspector Powers on both panels -- giving the setter equal visibility
  // into what the guesser is working toward, same as the quest box/info
  // badge already do.
  const questType = state.powers?.quest?.type;
  const questMeta = questType && window.QUEST_METADATA?.[questType];
  if (questMeta) {
    const row = document.createElement("div");
    row.className = "power-info-row power-info-active";
    row.innerHTML = `
      <span class="power-info-emoji">${questMeta.emoji || "🎯"}</span>
      <div class="power-info-body">
        <div class="power-info-title">Quest: ${questMeta.label}</div>
        <div class="power-info-desc">${questMeta.desc}</div>
      </div>
    `;
    sections.guesser.push(row);
  }

  if (sections.setter.length) {
    const h = document.createElement("div");
    h.className = "power-info-section";
    h.textContent = "Spy Powers";
    panel.appendChild(h);
    sections.setter.forEach(r => panel.appendChild(r));
  }

  if (sections.guesser.length) {
    const h = document.createElement("div");
    h.className = "power-info-section";
    h.textContent = "Inspector Powers";
    panel.appendChild(h);
    sections.guesser.forEach(r => panel.appendChild(r));
  }
}

function makeInfoHeader(text, role) {
  const h = document.createElement("div");
  h.className = `power-info-header power-info-header-${role}`;
  h.textContent = text;
  return h;
}



function showTooltip(target, { title, desc }) {
  if (!ENABLE_POWER_TOOLTIPS) return;
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
window.getPowerMeta = function (
  id,
  variant
) {
  const base =
    window.POWER_METADATA?.[id];

  if (!base) {
    return null;
  }

  const variantMeta =
    variant &&
    base.variants?.[variant]
      ? base.variants[variant]
      : null;

  return {
    ...base,
    ...(variantMeta || {}),

    opponentDesc:
      variantMeta?.opponentDesc ||
      base.opponentDesc ||
      window
        .OPPONENT_POWER_DESCRIPTIONS
        ?.[id] ||
      base.short ||
      base.desc
  };
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

function initPowerInfoButton(buttonId, role) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(
    role === "setter"
      ? "powerInfoPanelSetter"
      : "powerInfoPanelGuesser"
  );

  if (!btn || !panel) return;
  if (btn.dataset.bound) return;
  btn.dataset.bound = "true";
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

document.addEventListener("DOMContentLoaded", () => {
  initPowerInfoButton("powerInfoBtnSetter", "setter");
  initPowerInfoButton("powerInfoBtnGuesser", "guesser");
});

// POWER ACTION MODAL -- tapping a power/quest badge opens this instead of
// firing the action directly: title/desc for context, plus an explicit Use
// button (hidden/disabled when there's nothing to use right now). See
// powerEngine.js's createPowerButton (powers) and quest.js's
// updateQuestBadge (the guesser's quest) for the two callers.
function showPowerActionPopup({ emoji, title, desc, useLabel = "Use", showUse = true, useEnabled = true, onUse }) {
  const modal = document.getElementById("powerActionModal");
  if (!modal) return;

  modal.querySelector(".power-action-emoji").textContent = emoji || "";
  modal.querySelector(".power-action-title").textContent = title || "";
  modal.querySelector(".power-action-desc").textContent = desc || "";

  const useBtn = document.getElementById("powerActionUseBtn");
  useBtn.style.display = showUse ? "" : "none";
  useBtn.textContent = useLabel;
  useBtn.disabled = !useEnabled;
  useBtn.onclick = () => {
    hidePowerActionPopup();
    if (useEnabled) onUse?.();
  };

  modal.classList.add("active");
  window.tutorialOnPowerActionModalOpen?.();
}
window.showPowerActionPopup = showPowerActionPopup;

function hidePowerActionPopup() {
  document.getElementById("powerActionModal")?.classList.remove("active");
  window.tutorialOnPowerActionModalClose?.();
}
window.hidePowerActionPopup = hidePowerActionPopup;

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("powerActionModal");
  document.getElementById("powerActionCloseBtn")?.addEventListener("click", hidePowerActionPopup);
  // Tapping the dark backdrop (not the card itself) dismisses it, same as
  // every other modal's Cancel button but without requiring the tap to
  // land on a specific button.
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) hidePowerActionPopup();
  });
});

