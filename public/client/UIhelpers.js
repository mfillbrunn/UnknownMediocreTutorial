const tooltip = $("tooltip");

function showTooltip(target, { title, desc }) {
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
  requestAnimationFrame(() => tooltip.classList.add("show"));
}

function hideTooltip() {
  if (!tooltip) return;
  tooltip.classList.remove("show");
  tooltip.hidden = true;
}
