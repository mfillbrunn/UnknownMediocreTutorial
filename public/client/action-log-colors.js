(() => {
  "use strict";

  const LOG_IDS = ["actionLogSetter", "actionLogGuesser"];
  let observer = null;

  function powerEntries() {
    return Object.entries(window.POWER_METADATA || {})
      .map(([id, meta]) => ({
        id,
        label: String(meta?.label || "").trim(),
        color:
          window.POWER_PALETTES?.[id]?.[0] ||
          meta?.color ||
          null
      }))
      .filter(entry => entry.label && entry.color)
      .sort((a, b) => b.label.length - a.label.length);
  }

  function identifyPower(row) {
    const text = String(row.textContent || "").toLowerCase();

    if (text.includes("quest:")) {
      const matchingPower = powerEntries().find(entry =>
        text.includes(entry.label.toLowerCase())
      );

      return matchingPower || {
        id: "quest",
        label: "Quest",
        color: "#4ade80"
      };
    }

    return powerEntries().find(entry =>
      text.includes(entry.label.toLowerCase())
    ) || null;
  }

  function colorize(container) {
    if (!container) return;

    container.querySelectorAll(".log-entry.log-power").forEach(row => {
      const power = identifyPower(row);

      if (!power) {
        row.classList.remove("log-power-themed");
        row.style.removeProperty("--log-power-color");
        delete row.dataset.powerId;
        return;
      }

      row.classList.add("log-power-themed");
      row.dataset.powerId = power.id;
      row.style.setProperty("--log-power-color", power.color);
    });
  }

  function colorizeAll() {
    LOG_IDS.forEach(id => colorize(document.getElementById(id)));
  }

  function init() {
    colorizeAll();

    observer = new MutationObserver(mutations => {
      const containers = new Set();

      for (const mutation of mutations) {
        const target = mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target.parentElement;

        const container = target?.closest?.(
          "#actionLogSetter, #actionLogGuesser"
        );

        if (container) containers.add(container);
      }

      containers.forEach(colorize);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
