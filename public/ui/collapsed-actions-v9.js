(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const observers = [];
  const lastMeterValues = { setter: null };
  const toastTimers = new Map();
  const nodeIds = new WeakMap();

  let nextNodeId = 1;
  let updateFrame = 0;
  let updating = false;
  let lateMeterObserver = null;

  function nodeId(node) {
    if (!node) return "none";
    if (!nodeIds.has(node)) {
      nodeIds.set(node, nextNodeId++);
    }
    return String(nodeIds.get(node));
  }

  function screenFor(role) {
    return byId(role === "setter" ? "setterScreen" : "guesserScreen");
  }

  function drawerClosed(role) {
    return !!screenFor(role)?.classList.contains(
      role === "setter"
        ? "setter-sidebar-collapsed"
        : "guesser-sidebar-collapsed"
    );
  }

  function ensureDock(role) {
    const screen = screenFor(role);
    if (!screen) return null;

    const id = role === "setter"
      ? "setterCollapsedActionDock"
      : "guesserCollapsedActionDock";

    let dock = byId(id);

    if (!dock) {
      dock = document.createElement("div");
      dock.id = id;
      dock.className = `collapsed-action-dock ${role}-collapsed-action-dock hidden`;
      dock.setAttribute("aria-label", "Ready actions");
      screen.appendChild(dock);
    }

    return dock;
  }

  function iconForButton(button) {
    const svg = button?.querySelector(".power-icon");
    if (svg) return svg.cloneNode(true);

    const emoji = document.createElement("span");
    emoji.className = "collapsed-action-emoji";
    emoji.textContent = button?.textContent?.trim()?.slice(0, 2) || "⚡";
    return emoji;
  }

  function copyPalette(source, target) {
    const style = getComputedStyle(source);

    for (const variable of [
      "--power-color-1",
      "--power-color-2",
      "--power-color-3",
      "--role-accent"
    ]) {
      const value = style.getPropertyValue(variable).trim();
      if (value) target.style.setProperty(variable, value);
    }
  }

  function readyPowerButtons(role) {
    const container = byId(
      role === "setter"
        ? "setterPowerContainer"
        : "guesserPowerContainer"
    );

    if (!container) return [];

    return [...container.querySelectorAll(".power-btn.power-badge")].filter(button => {
      if (button.closest(".spy-charge-power-locked")) return false;
      if (button.classList.contains("power-used")) return false;
      if (button.classList.contains("disabled-btn")) return false;
      if (button.hidden || button.offsetParent === null) return false;

      if (button.classList.contains("quest-badge-tile")) {
        return (
          button.classList.contains("quest-ready") ||
          button.classList.contains("quest-oneaway")
        );
      }

      return !button.disabled;
    });
  }

  function buttonSignature(button, index) {
    const uses = button.querySelector(
      ".power-uses-badge, .quest-progress-chip"
    )?.textContent?.trim() || "";

    return [
      nodeId(button),
      index,
      button.dataset.powerId || button.id || button.title || "power",
      uses,
      button.disabled ? "disabled" : "enabled",
      button.classList.contains("quest-ready") ? "quest-ready" : "",
      button.classList.contains("quest-oneaway") ? "quest-oneaway" : ""
    ].join("|");
  }

  function createMiniFromPower(button, index) {
    const mini = document.createElement("button");
    mini.type = "button";
    mini.className = "collapsed-action-mini collapsed-power-mini";
    mini.dataset.sourceIndex = String(index);
    mini.title = button.title || button.getAttribute("aria-label") || "Use power";
    mini.setAttribute("aria-label", mini.title);

    copyPalette(button, mini);
    mini.appendChild(iconForButton(button));

    const uses = button.querySelector(
      ".power-uses-badge, .quest-progress-chip"
    );

    if (uses) {
      const chip = document.createElement("span");
      chip.className = "collapsed-action-chip";
      chip.textContent = uses.textContent;
      mini.appendChild(chip);
    }

    mini.addEventListener("click", event => {
      event.stopPropagation();

      if (button.isConnected && !button.disabled) {
        button.click();
      } else {
        scheduleUpdate();
      }
    });

    return mini;
  }

  function setterResetSource() {
    const source = byId("spyChargeActionBtn");

    if (
      !source ||
      source.disabled ||
      !source.classList.contains("is-ready")
    ) {
      return null;
    }

    return source;
  }

  function createSetterResetMini(source) {
    const mini = document.createElement("button");
    mini.type = "button";
    mini.className = "collapsed-action-mini collapsed-reset-mini";
    mini.title = "Reset one letter's feedback";
    mini.setAttribute("aria-label", mini.title);
    mini.innerHTML = `
      <span class="collapsed-reset-glyph" aria-hidden="true">↺</span>
      <span class="collapsed-action-chip">${
        byId("spyChargeResetCount")?.textContent || "1"
      }</span>
    `;

    mini.addEventListener("click", event => {
      event.stopPropagation();

      if (source.isConnected && !source.disabled) {
        source.click();
      } else {
        scheduleUpdate();
      }
    });

    return mini;
  }

  function updateRoleDock(role) {
    const dock = ensureDock(role);
    if (!dock) return;

    const show = (
      drawerClosed(role) &&
      screenFor(role)?.classList.contains("active")
    );

    dock.classList.toggle("hidden", !show);

    if (!show) {
      if (dock.childElementCount) {
        dock.replaceChildren();
      }
      dock.dataset.renderSignature = "";
      dock.classList.add("is-empty");
      return;
    }

    const buttons = readyPowerButtons(role);
    const resetSource = role === "setter" ? setterResetSource() : null;

    const signature = [
      role,
      ...buttons.map(buttonSignature),
      resetSource
        ? `reset:${nodeId(resetSource)}:${byId("spyChargeResetCount")?.textContent || "1"}`
        : "reset:none"
    ].join("::");

    if (dock.dataset.renderSignature === signature) {
      dock.classList.toggle(
        "is-empty",
        buttons.length === 0 && !resetSource
      );
      return;
    }

    const children = buttons.map(createMiniFromPower);

    if (resetSource) {
      children.push(createSetterResetMini(resetSource));
    }

    dock.replaceChildren(...children);
    dock.dataset.renderSignature = signature;
    dock.classList.toggle("is-empty", children.length === 0);
  }

  function updateAll() {
    if (updating) return;

    updating = true;

    try {
      updateRoleDock("setter");
      updateRoleDock("guesser");
    } finally {
      updating = false;
    }
  }

  function scheduleUpdate() {
    if (updateFrame) return;

    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      updateAll();
    });
  }

  function ensureToast(role) {
    const screen = screenFor(role);
    if (!screen) return null;

    const id = `${role}CollapsedChargeToast`;
    let toast = byId(id);

    if (!toast) {
      toast = document.createElement("div");
      toast.id = id;
      toast.className = `collapsed-charge-toast collapsed-charge-toast-${role}`;
      toast.setAttribute("aria-live", "polite");
      screen.appendChild(toast);
    }

    return toast;
  }

  window.showCollapsedChargeToast = function (role, detail = {}) {
    const toast = ensureToast(role);
    if (!toast) return null;

    clearTimeout(toastTimers.get(role));

    const value = Number(detail.value) || 0;
    const max = Number(detail.max) || 0;
    const delta = Number(detail.delta) || 0;

    toast.dataset.tone = detail.tone || "blue";
    toast.innerHTML = `
      <span class="collapsed-charge-toast-icon">${
        role === "setter" ? "★" : "⚡"
      }</span>
      <span class="collapsed-charge-toast-main">${value}/${max}</span>
      ${
        delta
          ? `<span class="collapsed-charge-toast-delta">+${delta}</span>`
          : ""
      }
    `;

    toast.classList.add("show");

    toastTimers.set(
      role,
      setTimeout(() => {
        toast.classList.remove("show");
      }, 2100)
    );

    return toast;
  };

  function observeSetterMeter() {
    const meter = byId("spyChargeMeter");

    if (!meter || meter.__collapsedV91Observed) {
      return !!meter;
    }

    meter.__collapsedV91Observed = true;

    const read = () => (
      Number(meter.getAttribute("aria-valuenow")) || 0
    );

    lastMeterValues.setter = read();

    const observer = new MutationObserver(() => {
      const current = read();
      const prior = lastMeterValues.setter;
      lastMeterValues.setter = current;

      if (
        drawerClosed("setter") &&
        prior != null &&
        current > prior
      ) {
        window.showCollapsedChargeToast("setter", {
          value: current,
          max: 12,
          delta: current - prior,
          tone:
            current >= 12
              ? "purple"
              : current >= 8
                ? "cyan"
                : current >= 5
                  ? "yellow"
                  : "blue"
        });
      }

      scheduleUpdate();
    });

    observer.observe(meter, {
      attributes: true,
      attributeFilter: ["aria-valuenow", "class"]
    });

    observers.push(observer);
    return true;
  }

  function observePowerContainer(id) {
    const element = byId(id);

    if (!element || element.__collapsedV91Observed) {
      return;
    }

    element.__collapsedV91Observed = true;

    const observer = new MutationObserver(scheduleUpdate);

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled", "hidden", "style", "title"]
    });

    observers.push(observer);
  }

  function observeScreenClass(id) {
    const element = byId(id);

    if (!element || element.__collapsedV91Observed) {
      return;
    }

    element.__collapsedV91Observed = true;

    const observer = new MutationObserver(scheduleUpdate);

    /*
     * Deliberately observe only the screen's own class.
     * Observing its whole subtree caused the generated dock to observe
     * its own replaceChildren() calls and enter an endless callback loop.
     */
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["class"]
    });

    observers.push(observer);
  }

  function watchForLateMeter() {
    if (observeSetterMeter() || lateMeterObserver || !document.body) {
      return;
    }

    lateMeterObserver = new MutationObserver(() => {
      if (observeSetterMeter()) {
        lateMeterObserver.disconnect();
        lateMeterObserver = null;
        scheduleUpdate();
      }
    });

    lateMeterObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function installObservers() {
    observePowerContainer("setterPowerContainer");
    observePowerContainer("guesserPowerContainer");
    observeScreenClass("setterScreen");
    observeScreenClass("guesserScreen");
    watchForLateMeter();
  }


  // UMT_USER_FIX_PACK_V1: delegated drawer-toggle safety net.
  // The listener remains valid even if a screen subtree is replaced.
  function drawerToggleFromClick(event) {
    const rawTarget = event.target;
    const target = rawTarget instanceof Element
      ? rawTarget
      : rawTarget?.parentElement || null;
    const toggle = target?.closest?.("#setterSidebarToggle, #guesserSidebarToggle");
    if (!toggle || event.__umtDrawerToggleHandled) return;

    const role = toggle.id === "setterSidebarToggle" ? "setter" : "guesser";
    const roleScreen = screenFor(role);
    if (!roleScreen || !roleScreen.contains(toggle)) return;

    event.__umtDrawerToggleHandled = true;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();

    const nextCollapsed = !drawerClosed(role);
    const setter = role === "setter"
      ? window.setSetterSidebarCollapsed
      : window.setGuesserSidebarCollapsed;

    if (typeof setter === "function") {
      setter(nextCollapsed);
    } else {
      const className = role === "setter"
        ? "setter-sidebar-collapsed"
        : "guesser-sidebar-collapsed";
      roleScreen.classList.toggle(className, nextCollapsed);
      roleScreen.dataset.sidebarCollapsed = nextCollapsed ? "true" : "false";
      toggle.setAttribute("aria-expanded", String(!nextCollapsed));
    }

    window.notifyTutorialSidebarToggled?.();
    scheduleUpdate();
  }

  function clearDrawerSwipeVisuals() {
    screenFor("setter")?.classList.remove("setter-sidebar-swipe-active");
    screenFor("guesser")?.classList.remove("guesser-sidebar-swipe-active");
  }

  function installDrawerToggleFallback() {
    if (document.documentElement.dataset.umtDrawerToggleFallback === "1") return;
    document.documentElement.dataset.umtDrawerToggleFallback = "1";
    document.addEventListener("click", drawerToggleFromClick, true);
    window.addEventListener("blur", clearDrawerSwipeVisuals);
    window.addEventListener("pointercancel", clearDrawerSwipeVisuals, true);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearDrawerSwipeVisuals();
    });
  }

  function init() {
    installDrawerToggleFallback();
    ensureDock("setter");
    ensureDock("guesser");
    installObservers();
    scheduleUpdate();
  }

  window.updateCollapsedActionDocks = scheduleUpdate;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
