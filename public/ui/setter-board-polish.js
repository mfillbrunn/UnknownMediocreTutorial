(() => {
  "use strict";

  const byId = id => document.getElementById(id);

  function ensureDecisionMeta() {
    const stage = document.querySelector(
      "#setterScreen .setter-decision-stage"
    );

    if (!stage) return null;

    let meta = byId("setterDecisionMeta");

    if (!meta) {
      meta = document.createElement("div");
      meta.id = "setterDecisionMeta";
      meta.className = "setter-decision-meta";

      const draftWrap = stage.querySelector(".draft-row-wrap");
      stage.insertBefore(meta, draftWrap || stage.firstChild);
    }

    let starsMount = byId("setterStarsMount");

    if (!starsMount) {
      starsMount = document.createElement("div");
      starsMount.id = "setterStarsMount";
      starsMount.className = "setter-stars-mount";
      meta.prepend(starsMount);
    }

    const stars = byId("setterCoverStars");
    if (stars && stars.parentElement !== starsMount) {
      starsMount.appendChild(stars);
    }

    const remaining = byId("SetterRemainingBox");
    if (remaining && remaining.parentElement !== meta) {
      meta.appendChild(remaining);
    }

    return meta;
  }

  function numberFrom(el) {
    const text = el?.textContent?.replace(/[^0-9-]/g, "") || "";
    if (!text || text === "-") return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function syncRemainingComparison() {
    const box = byId("SetterRemainingBox");
    if (!box) return;

    ensureDecisionMeta();

    const keepStat =
      box.querySelector(".remaining-keep") ||
      box.querySelector(".remaining-stat:first-child");

    const newStat =
      box.querySelector(".remaining-new") ||
      box.querySelector(".remaining-stat:last-child");

    if (!keepStat || !newStat) return;

    keepStat.classList.add("remaining-keep");
    newStat.classList.add("remaining-new");

    const decision = box.querySelector(".remaining-stats");
    decision?.classList.add("setter-remaining-decision");

    let arrow = decision?.querySelector(".remaining-decision-arrow");

    if (decision && !arrow) {
      arrow = document.createElement("span");
      arrow.className = "remaining-decision-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";
      decision.insertBefore(arrow, newStat);
    }

    const keepValue = numberFrom(
      keepStat.querySelector(".remaining-stat-value")
    );

    const newValueEl = newStat.querySelector(".remaining-stat-value");
    const newValue = numberFrom(newValueEl);
    const invalid = !!newValueEl?.querySelector(".inconsistent-x");

    box.classList.remove(
      "comparison-better",
      "comparison-worse",
      "comparison-equal",
      "comparison-unknown",
      "comparison-invalid"
    );

    if (invalid) {
      box.classList.add("comparison-invalid");
    } else if (keepValue == null || newValue == null) {
      box.classList.add("comparison-unknown");
    } else if (newValue > keepValue) {
      box.classList.add("comparison-better");
    } else if (newValue < keepValue) {
      box.classList.add("comparison-worse");
    } else {
      box.classList.add("comparison-equal");
    }
  }

  function installRemainingObserver() {
    const box = byId("SetterRemainingBox");
    if (!box || box.__comparisonObserver) return;

    const observer = new MutationObserver(syncRemainingComparison);
    observer.observe(box, {
      childList: true,
      subtree: true,
      characterData: true
    });

    box.__comparisonObserver = observer;
    syncRemainingComparison();
  }

  function installTrashIcon() {
    const button = byId("setterClearDraftBtn");
    if (!button || button.dataset.trashIconReady === "1") return;

    button.dataset.trashIconReady = "1";
    button.innerHTML = `
      <svg
        class="setter-clear-trash-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
      <span>Clear</span>
    `;
  }

  function clearFloatingPanelStyles(panel) {
    if (!panel) return;

    panel.classList.remove(
      "idle-floating",
      "idle-flip-animating",
      "drag-expanding"
    );

    for (const property of [
      "position",
      "top",
      "left",
      "right",
      "bottom",
      "width",
      "height",
      "maxHeight",
      "transform",
      "transition",
      "zIndex",
      "willChange"
    ]) {
      panel.style.removeProperty(property);
    }
  }

  function disableActivityMaximizing() {
    byId("setterActivityDragHandle")?.remove();

    document.body.classList.remove("activity-drag-active");

    document
      .querySelector("#setterScreen .setter-sidebar-activity")
      ?.classList.remove("idle-mode");

    byId("setterNotesIdleHint")?.classList.add("hidden");

    clearFloatingPanelStyles(byId("actionLogSetter"));
    clearFloatingPanelStyles(byId("notesPanelSetter"));

    const history = byId("setterGuesserSubmitted");
    history?.style.removeProperty("max-height");
    history?.style.removeProperty("height");
  }

  function installActivityOverride() {
    disableActivityMaximizing();

    window.updateSetterIdleExpand = function () {
      disableActivityMaximizing();
    };

    window.reanchorSetterIdleNotes = function () {
      disableActivityMaximizing();
    };
  }

  function copyTileGeometry(sourceRow, cloneRow) {
    const sourceTiles = sourceRow.querySelectorAll(
      ":scope > .history-tile"
    );

    const cloneTiles = cloneRow.querySelectorAll(
      ":scope > .history-tile"
    );

    sourceTiles.forEach((source, index) => {
      const clone = cloneTiles[index];
      if (!clone) return;

      const rect = source.getBoundingClientRect();
      const style = getComputedStyle(source);

      Object.assign(clone.style, {
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        flex: `0 0 ${rect.width}px`,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        borderRadius: style.borderRadius,
        letterSpacing: style.letterSpacing
      });
    });
  }

  window.captureSetterPendingGuessVisual = function (row) {
    if (!row?.isConnected) return null;

    document
      .querySelectorAll(".setter-pending-hold-clone")
      .forEach(el => el.remove());

    const rect = row.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const clone = row.cloneNode(true);
    clone.classList.add("setter-pending-hold-clone");
    clone.classList.remove("row-slide-in", "row-slide-down");
    clone.setAttribute("aria-hidden", "true");

    clone.querySelectorAll("[id]").forEach(el => {
      el.removeAttribute("id");
    });

    copyTileGeometry(row, clone);

    const rowStyle = getComputedStyle(row);

    Object.assign(clone.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      display: "flex",
      gap: rowStyle.gap,
      margin: "0",
      zIndex: "99990",
      pointerEvents: "none",
      transform: "none",
      opacity: "1"
    });

    document.body.appendChild(clone);

    const stars = byId("setterCoverStars");
    const starRect =
      stars && !stars.classList.contains("hidden")
        ? stars.getBoundingClientRect()
        : null;

    if (starRect?.width && starRect?.height) {
      window._pendingSpyChargeSourceRect = {
        left: starRect.left,
        top: starRect.top,
        width: starRect.width,
        height: starRect.height
      };
    }

    return {
      holdClone: clone,
      starRect:
        starRect?.width && starRect?.height
          ? {
              left: starRect.left,
              top: starRect.top,
              width: starRect.width,
              height: starRect.height
            }
          : null
    };
  };

  window.spawnSpyChargeLandingBurst = function (rect, bonus = false) {
    if (!rect?.width || !rect?.height) return;

    const burst = document.createElement("div");
    burst.className =
      `spy-charge-landing-burst${bonus ? " is-bonus" : ""}`;

    burst.style.left = `${rect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top + rect.height / 2}px`;

    const ring = document.createElement("span");
    ring.className = "spy-charge-landing-ring";
    burst.appendChild(ring);

    const angles = [-78, -34, 8, 52, 96, 148, 202, 250];

    for (const angle of angles) {
      const particle = document.createElement("span");
      particle.className = "spy-charge-landing-particle";
      particle.style.setProperty("--burst-angle", `${angle}deg`);
      burst.appendChild(particle);
    }

    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 760);
  };

  function startObservers() {
    const screen = byId("setterScreen");
    if (!screen || screen.__polishObserver) return;

    const observer = new MutationObserver(() => {
      ensureDecisionMeta();
      installRemainingObserver();
      installTrashIcon();
      disableActivityMaximizing();
    });

    observer.observe(screen, {
      childList: true,
      subtree: true
    });

    screen.__polishObserver = observer;
  }

  function init() {
    ensureDecisionMeta();
    installRemainingObserver();
    installTrashIcon();
    installActivityOverride();
    startObservers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
