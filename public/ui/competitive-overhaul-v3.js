// Idempotent DOM normalizer for dynamic reward cards (label/rarity
// cleanup) -- runs on load and on any subsequent DOM mutation so
// server-driven reward-card re-renders stay normalized too.
(() => {
  "use strict";
  if (window.__competitiveOverhaulV3) return;
  window.__competitiveOverhaulV3 = true;

  const exact = (node, replacements) => {
    if (!node) return;
    const current = String(node.textContent || "").trim();
    const next = replacements[current];
    if (next && next !== current) node.textContent = next;
  };

  function normalizeRewards(root = document) {
    root.querySelectorAll?.(".pc-card-pick").forEach(node => node.remove());

    root.querySelectorAll?.(".pc-toolbar-note").forEach(node => exact(node, {
      "Choose one card to continue": "Select one reward to continue",
      "Pick one card to continue": "Select one reward to continue"
    }));

    root.querySelectorAll?.(".pc-refresh-label").forEach(node => exact(node, {
      "New hand": "Refresh choices",
      "Refresh hand": "Refresh choices",
      "Refresh Hand": "Refresh choices"
    }));

    root.querySelectorAll?.(".pc-refresh-choice-btn").forEach(button => {
      const spent = button.disabled || /spent|used/i.test(button.textContent || "");
      const label = spent ? "Refresh already used" : "Refresh reward choices";
      button.title = label;
      button.setAttribute("aria-label", label);
    });

    root.querySelectorAll?.(".pc-choice-card").forEach(card => {
      const badge = card.querySelector(".pc-rarity-badge, .pc-tier");
      if (!badge) return;
      const raw = String(card.dataset.rarity || badge.textContent || "").toLowerCase();
      const rarity = raw.includes("legend") ? "legend" : raw.includes("rare") ? "rare" : "common";
      card.dataset.rarity = rarity;
      const label = rarity === "legend" ? "Legend" : rarity[0].toUpperCase() + rarity.slice(1);
      badge.setAttribute("aria-label", `${label} reward`);
      badge.title = `${label} reward`;
    });
  }

  let scheduled = false;
  const normalize = () => {
    scheduled = false;
    normalizeRewards(document);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(normalize);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalize, { once: true });
  } else {
    normalize();
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
