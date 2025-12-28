let activeTooltipTarget = null;

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
  const seconds = parseInt($("timeControlSelect").value, 10);
  if (!isNaN(seconds)) {
    sendGameAction(roomId, {
      type: "SET_TIME_CONTROL",
      seconds
    });
  }
};

