(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const observers = [];
  const lastMeterValues = { setter: null, guesser: null };
  const toastTimers = new Map();

  function screenFor(role) {
    return byId(role === "setter" ? "setterScreen" : "guesserScreen");
  }

  function drawerClosed(role) {
    return !!screenFor(role)?.classList.contains(
      role === "setter" ? "setter-sidebar-collapsed" : "guesser-sidebar-collapsed"
    );
  }

  function ensureDock(role) {
    const screen = screenFor(role);
    if (!screen) return null;

    const id = role === "setter" ? "setterCollapsedActionDock" : "guesserCollapsedActionDock";
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
    for (const variable of ["--power-color-1", "--power-color-2", "--power-color-3", "--role-accent"]) {
      const value = style.getPropertyValue(variable).trim();
      if (value) target.style.setProperty(variable, value);
    }
  }

  function readyPowerButtons(role) {
    const container = byId(role === "setter" ? "setterPowerContainer" : "guesserPowerContainer");
    if (!container) return [];

    return [...container.querySelectorAll(".power-btn.power-badge")].filter(button => {
      if (button.closest(".spy-charge-power-locked")) return false;
      if (button.classList.contains("power-used")) return false;
      if (button.classList.contains("disabled-btn")) return false;
      if (button.hidden || button.offsetParent === null) return false;

      if (button.classList.contains("quest-badge-tile")) {
        return button.classList.contains("quest-ready") || button.classList.contains("quest-oneaway");
      }

      return !button.disabled;
    });
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

    const uses = button.querySelector(".power-uses-badge, .quest-progress-chip");
    if (uses) {
      const chip = document.createElement("span");
      chip.className = "collapsed-action-chip";
      chip.textContent = uses.textContent;
      mini.appendChild(chip);
    }

    mini.addEventListener("click", event => {
      event.stopPropagation();
      button.click();
    });

    return mini;
  }

  function createSetterResetMini() {
    const source = byId("spyChargeActionBtn");
    if (!source || source.disabled || !source.classList.contains("is-ready")) return null;

    const mini = document.createElement("button");
    mini.type = "button";
    mini.className = "collapsed-action-mini collapsed-reset-mini";
    mini.title = "Reset one letter's feedback";
    mini.setAttribute("aria-label", mini.title);
    mini.innerHTML = `
      <span class="collapsed-reset-glyph" aria-hidden="true">↺</span>
      <span class="collapsed-action-chip">${byId("spyChargeResetCount")?.textContent || "1"}</span>
    `;
    mini.addEventListener("click", event => {
      event.stopPropagation();
      source.click();
    });
    return mini;
  }

  function updateRoleDock(role) {
    const dock = ensureDock(role);
    if (!dock) return;

    const show = drawerClosed(role) && screenFor(role)?.classList.contains("active");
    dock.classList.toggle("hidden", !show);

    if (!show) {
      dock.replaceChildren();
      return;
    }

    const buttons = readyPowerButtons(role);
    const children = buttons.map(createMiniFromPower);

    if (role === "setter") {
      const reset = createSetterResetMini();
      if (reset) children.push(reset);
    }

    dock.replaceChildren(...children);
    dock.classList.toggle("is-empty", children.length === 0);
  }

  function updateAll() {
    updateRoleDock("setter");
    updateRoleDock("guesser");
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
      <span class="collapsed-charge-toast-icon">${role === "setter" ? "★" : "⚡"}</span>
      <span class="collapsed-charge-toast-main">${value}/${max}</span>
      ${delta ? `<span class="collapsed-charge-toast-delta">+${delta}</span>` : ""}
    `;
    toast.classList.add("show");

    toastTimers.set(role, setTimeout(() => {
      toast.classList.remove("show");
    }, 2100));

    return toast;
  };

  function observeSetterMeter() {
    const meter = byId("spyChargeMeter");
    if (!meter || meter.__collapsedV9Observed) return;
    meter.__collapsedV9Observed = true;

    const read = () => Number(meter.getAttribute("aria-valuenow")) || 0;
    lastMeterValues.setter = read();

    const observer = new MutationObserver(() => {
      const current = read();
      const prior = lastMeterValues.setter;
      lastMeterValues.setter = current;

      if (drawerClosed("setter") && prior != null && current > prior) {
        window.showCollapsedChargeToast("setter", {
          value: current,
          max: 12,
          delta: current - prior,
          tone: current >= 12 ? "purple" : current >= 8 ? "cyan" : current >= 5 ? "yellow" : "blue"
        });
      }
      updateAll();
    });
    observer.observe(meter, { attributes: true, subtree: true, attributeFilter: ["aria-valuenow", "class"] });
    observers.push(observer);
  }

  function installObservers() {
    for (const id of ["setterPowerContainer", "guesserPowerContainer", "setterScreen", "guesserScreen"]) {
      const element = byId(id);
      if (!element || element.__collapsedV9Observed) continue;
      element.__collapsedV9Observed = true;
      const observer = new MutationObserver(updateAll);
      observer.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "disabled", "style"]
      });
      observers.push(observer);
    }

    observeSetterMeter();
    if (!byId("spyChargeMeter")) requestAnimationFrame(installObservers);
  }

  function init() {
    ensureDock("setter");
    ensureDock("guesser");
    installObservers();
    updateAll();
  }

  window.updateCollapsedActionDocks = updateAll;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
