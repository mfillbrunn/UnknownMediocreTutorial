(() => {
  "use strict";
  if (window.__powerChoiceModeClient) return;
  window.__powerChoiceModeClient = true;

  const MODE = "powerChoice";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const me = () => window.currentUser?.id || window.getUserId?.() || null;
  const isMode = () => window.state?.gameMode === MODE && !!window.state?.powerChoice?.enabled;
  const myRole = () => me() === window.state?.setter ? "setter" : me() === window.state?.guesser ? "guesser" : window.myRole;

  function ensureModeOption() {
    const select = document.getElementById("powerModeSelect");
    if (!select) return;
    let option = [...select.options].find(item => item.value === MODE);
    if (!option) {
      option = document.createElement("option");
      option.value = MODE;
      option.textContent = "Power Choice";
      select.insertBefore(option, select.firstChild);
    }
    if (window.state?.phase === "lobby" && (window.state.gameMode || MODE) === MODE && document.activeElement !== select) select.value = MODE;
  }

  const oldUpdatePowerModeUI = window.updatePowerModeUI;
  window.updatePowerModeUI = async function powerChoiceUpdatePowerModeUI(...args) {
    if (typeof oldUpdatePowerModeUI === "function") await oldUpdatePowerModeUI.apply(this, args);
    ensureModeOption();
    const select = document.getElementById("powerModeSelect");
    if (!select || !window.state) return;
    if (window.state.gameMode === MODE && document.activeElement !== select) select.value = MODE;
  };

  function progressDots(value, thresholds, unit) {
    const max = thresholds[thresholds.length - 1];
    return `<div class="pc-progress" aria-label="${value} of ${max} ${unit}"><div class="pc-progress-fill" style="width:${Math.min(100, value / max * 100)}%"></div></div>
      <div class="pc-milestones">${thresholds.map(n => `<span class="${value >= n ? "is-earned" : ""}">${n}</span>`).join("")}</div>`;
  }
  function questMarkup(quest, preview) {
    if (!quest) return "";
    const conditions = Array.isArray(quest.conditionLabels) && quest.conditionLabels.length
      ? `<ul>${quest.conditionLabels.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
    return `<article class="pc-quest ${preview ? "is-preview" : "is-current"}">
      <div class="pc-quest-kicker">${preview ? "NEXT QUEST" : "CURRENT QUEST"}</div>
      <div class="pc-quest-head"><span class="pc-quest-icon">${esc(quest.icon || "◆")}</span><strong>${esc(quest.title)}</strong></div>
      <p>${esc(quest.description)}</p>${conditions}
    </article>`;
  }
  function renderSpy(container, pc) {
    const total = Number(window.state?.powers?.spyCharge?.total) || 0;
    const pending = pc?.pendingChoice?.role === "setter";
    container.innerHTML = `<section class="pc-side-panel pc-spy-panel">
      <div class="pc-side-title"><span>🕵</span><div><b>SPY</b><small>Power Choice</small></div></div>
      <div class="pc-charge-number"><strong>${total}</strong><span>/ 15 stars</span></div>
      ${progressDots(total, [5,8,15], "stars")}
      <p class="pc-side-copy">Earn at least 1 star after every Keep/New decision. Rewards become a three-card choice at 5, 8 and 15.</p>
      ${pending ? `<div class="pc-choice-ready">CARD CHOICE READY</div>` : ""}
    </section>`;
  }
  function renderInspector(container, pc) {
    const inspector = pc?.inspector;
    const points = Number(inspector?.points) || 0;
    const last = inspector?.lastResult;
    container.innerHTML = `<section class="pc-side-panel pc-inspector-panel">
      <div class="pc-side-title"><span>🔎</span><div><b>INSPECTOR</b><small>Power Choice</small></div></div>
      <div class="pc-charge-number"><strong>${points}</strong><span>/ 5 quest points</span></div>
      ${progressDots(points, [2,3,5], "quest points")}
      ${last ? `<div class="pc-last-result ${last.success ? "is-success" : "is-miss"}">${last.success ? "QUEST COMPLETE · +1" : "Quest not met"}</div>` : ""}
      ${questMarkup(inspector?.currentQuest, false)}
      ${questMarkup(inspector?.nextQuest, true)}
    </section>`;
  }
  function renderPanels() {
    const state = window.state;
    document.body.classList.toggle("power-choice-mode", isMode());
    if (!isMode()) return;
    const role = myRole();
    const setter = document.getElementById("setterPowerContainer");
    const guesser = document.getElementById("guesserPowerContainer");
    if (role === "setter" && setter) renderSpy(setter, state.powerChoice);
    if (role === "guesser" && guesser) renderInspector(guesser, state.powerChoice);
  }

  function ensureModal() {
    let modal = document.getElementById("powerChoiceModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "powerChoiceModal";
    modal.className = "pc-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<div class="pc-modal-card"><div class="pc-modal-kicker">POWER CHOICE · +30 SECONDS</div><h2></h2><p class="pc-modal-sub"></p><div class="pc-card-grid"></div></div>`;
    document.body.appendChild(modal);
    return modal;
  }
  function iconFor(option) {
    if (option.kind === "power") return window.POWER_METADATA?.[option.powerId]?.emoji || option.icon || "⚡";
    return option.icon || "◆";
  }
  function showChoice() {
    const pending = window.state?.powerChoice?.pendingChoice;
    const modal = ensureModal();
    if (!isMode() || !pending || pending.ownerUserId !== me()) {
      modal.classList.remove("is-open");
      return;
    }
    if (modal.dataset.choiceId === pending.id && modal.classList.contains("is-open")) return;
    modal.dataset.choiceId = pending.id;
    modal.querySelector("h2").textContent = pending.title || "Choose a power";
    modal.querySelector(".pc-modal-sub").textContent = pending.subtitle || "Choose one card.";
    const grid = modal.querySelector(".pc-card-grid");
    grid.innerHTML = (pending.options || []).map(option => {
      const tier = option.kind === "power" ? `<span class="pc-tier">TIER ${option.tier || window.POWER_TIERS?.[option.powerId]?.tier || 1}</span>` : "";
      return `<button type="button" class="pc-choice-card" data-option-id="${esc(option.id)}">
        <span class="pc-card-icon">${esc(iconFor(option))}</span>${tier}<strong>${esc(option.title)}</strong><span class="pc-card-desc">${esc(option.description)}</span><span class="pc-card-pick">CHOOSE</span>
      </button>`;
    }).join("");
    grid.querySelectorAll(".pc-choice-card").forEach(button => button.addEventListener("click", () => {
      if (button.disabled) return;
      grid.querySelectorAll("button").forEach(item => item.disabled = true);
      window.sendGameAction?.({
        type: "POWER_CHOICE_SELECT",
        userId: me(),
        choiceId: pending.id,
        optionId: button.dataset.optionId
      });
    }));
    modal.classList.add("is-open");
    grid.querySelector("button")?.focus();
  }

  function markEliminatedKeys() {
    const eliminated = new Set(window.state?.powerChoice?.eliminatedLetters || []);
    document.querySelectorAll("#keyboardGuesser button, #keyboardGuesser [data-key], #keyboardGuesser .key").forEach(key => {
      const letter = String(key.dataset?.key || key.textContent || "").trim().toUpperCase();
      const blocked = /^[A-Z]$/.test(letter) && eliminated.has(letter);
      key.classList.toggle("pc-key-eliminated", blocked);
      key.setAttribute("aria-disabled", blocked ? "true" : "false");
      if (blocked) key.title = `${letter} was ruled out`;
    });
  }
  function blockedLetter(letter) {
    return isMode() && myRole() === "guesser" && (window.state?.powerChoice?.eliminatedLetters || []).includes(String(letter || "").toUpperCase());
  }
  document.addEventListener("click", event => {
    const key = event.target.closest?.("#keyboardGuesser button, #keyboardGuesser [data-key], #keyboardGuesser .key");
    if (!key) return;
    const letter = String(key.dataset?.key || key.textContent || "").trim().toUpperCase();
    if (!blockedLetter(letter)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.toast?.(`${letter} was ruled out by Power Choice.`);
  }, true);
  document.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^[a-z]$/i.test(event.key) || !blockedLetter(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.toast?.(`${event.key.toUpperCase()} was ruled out by Power Choice.`);
  }, true);

  function renderAll() {
    ensureModeOption();
    renderPanels();
    showChoice();
    markEliminatedKeys();
  }
  try { socket.on("stateUpdate", () => setTimeout(renderAll, 0)); } catch {}
  try { socket.on("powerChoiceResolved", payload => window.toast?.(`${payload?.title || "Power Choice"} activated`)); } catch {}
  document.addEventListener("DOMContentLoaded", renderAll);
  setInterval(renderAll, 700);
})();
