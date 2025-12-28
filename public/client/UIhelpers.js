function showTooltip(target, { title, desc }) {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;

  tooltip.innerHTML = `
    <div class="tooltip-title">${title}</div>
    <div class="tooltip-desc">${desc}</div>
  `;

  const rect = target.getBoundingClientRect();
  const padding = 8;

  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - padding}px`;
  tooltip.style.transform = "translate(-50%, -100%)";

  tooltip.hidden = false;
  requestAnimationFrame(() => { tooltip.classList.add("show");});
}

function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;
  if (!title && !desc) return;
  tooltip.classList.remove("show");
   setTimeout(() => {
    tooltip.hidden = true;
  }, 150);
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
