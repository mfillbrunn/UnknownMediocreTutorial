// public/single-player/stage-result.js
//
// Renders the singlePlayer:stageResult broadcast (score/stars/objectives,
// plus an optional choose-one reward) into #spResultView. When the stage
// grants a choose-one reward, "Continue" stays disabled until the player
// actually picks one -- picking auto-advances instead of requiring a
// second click, since there's nothing left to decide once that happens.

(function () {
  "use strict";

  function starGlyphs(count) {
    const n = Math.max(0, Math.min(3, Number(count) || 0));
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  function objectiveLabel(id) {
    const objectives = window.SinglePlayerCampaign.activeStage?.objectives || [];
    const match = objectives.find(o => o.id === id);
    return match?.label || id;
  }

  function isObjectiveRequired(id) {
    const objectives = window.SinglePlayerCampaign.activeStage?.objectives || [];
    return !!objectives.find(o => o.id === id)?.required;
  }

  function renderObjectives(objectiveResults) {
    const list = document.getElementById("spResultObjectives");
    if (!list) return;
    list.innerHTML = "";
    Object.entries(objectiveResults || {}).forEach(([id, passed]) => {
      const li = document.createElement("li");
      li.className = `sp-objective-row ${passed ? "sp-objective-passed" : "sp-objective-failed"}`;

      const icon = document.createElement("span");
      icon.className = "sp-objective-icon";
      icon.textContent = passed ? "✔" : "✘";
      li.appendChild(icon);

      const label = document.createElement("span");
      label.className = "sp-objective-label";
      label.textContent = objectiveLabel(id) + (isObjectiveRequired(id) ? "" : " (bonus)");
      li.appendChild(label);

      list.appendChild(li);
    });
  }

  function powerLabel(powerId) {
    const meta = window.getPowerMeta ? window.getPowerMeta(powerId) : window.POWER_METADATA?.[powerId];
    return { emoji: meta?.emoji || "⚡", label: meta?.label || powerId, desc: meta?.short || meta?.desc || "" };
  }

  function renderRewardChoice(payload, onResolved) {
    const wrap = document.getElementById("spResultReward");
    const optionsEl = document.getElementById("spRewardOptions");
    if (!wrap || !optionsEl) return;

    if (!payload.hasChooseOne || !payload.chooseOne?.length) {
      wrap.classList.add("hidden");
      onResolved(true);
      return;
    }

    wrap.classList.remove("hidden");
    optionsEl.innerHTML = "";

    const choice = payload.chooseOne[0];
    (choice.options || []).forEach(option => {
      const meta = powerLabel(option.powerId);
      const optBtn = document.createElement("button");
      optBtn.type = "button";
      optBtn.className = "sp-reward-option";

      const emoji = document.createElement("span");
      emoji.className = "sp-reward-option-emoji";
      emoji.textContent = meta.emoji;
      optBtn.appendChild(emoji);

      const text = document.createElement("span");
      text.className = "sp-reward-option-text";
      const title = document.createElement("span");
      title.className = "sp-reward-option-title";
      title.textContent = `${meta.label} (${option.role === "setter" ? "Secretkeeper" : "Guesser"})`;
      text.appendChild(title);
      if (meta.desc) {
        const desc = document.createElement("span");
        desc.className = "sp-reward-option-desc";
        desc.textContent = meta.desc;
        text.appendChild(desc);
      }
      optBtn.appendChild(text);

      optBtn.addEventListener("click", () => {
        optionsEl.querySelectorAll(".sp-reward-option").forEach(b => (b.disabled = true));
        window.SinglePlayerCampaign.emit("singlePlayer:chooseReward", {
          roomId: window.SinglePlayerCampaign.activeRoomId,
          choiceId: choice.id,
          optionId: `${option.role}:${option.powerId}`
        }).then(result => {
          if (result.ok) {
            onResolved(true);
          } else {
            optionsEl.querySelectorAll(".sp-reward-option").forEach(b => (b.disabled = false));
            if (typeof toast === "function") toast(result.error || "Could not apply that reward.");
          }
        });
      });

      optionsEl.appendChild(optBtn);
    });
  }

  function show(payload) {
    window.showScreen("singlePlayerScreen");
    window.SinglePlayerCampaign.showView("spResultView");

    const starsEl = document.getElementById("spResultStars");
    if (starsEl) starsEl.textContent = starGlyphs(payload.stars);

    const rankEl = document.getElementById("spResultRank");
    if (rankEl) rankEl.textContent = payload.rankLabel || (payload.completed ? "Cleared" : "Not Cleared");

    const scoreEl = document.getElementById("spResultScore");
    if (scoreEl) {
      scoreEl.textContent = `${payload.score ?? 0} pts` + (payload.newBest ? " — New Best!" : "");
    }

    renderObjectives(payload.objectiveResults);

    const continueBtn = document.getElementById("spResultContinueBtn");
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.onclick = () => window.SinglePlayerCampaign.advanceAfterResult();
    }

    renderRewardChoice(payload, () => {
      if (continueBtn) continueBtn.disabled = false;
    });
  }

  window.SinglePlayerStageResult = { show };
})();
