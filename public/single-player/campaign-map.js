// public/single-player/campaign-map.js
// UMT_CAMPAIGN_MAP_BUSY_FIX_V1
// Renders campaign stages and exposes one shared busy state for stage startup.
(function () {
  "use strict";

  let startingStageId = null;

  function starGlyphs(count) {
    const n = Math.max(0, Math.min(3, Number(count) || 0));
    return "\u2605".repeat(n) + "\u2606".repeat(3 - n);
  }

  function statusLabel(status) {
    switch (status) {
      case "locked": return "Locked";
      case "completed": return "Completed";
      case "in_progress": return "In Progress";
      default: return "Available";
    }
  }

  function syncStartingState() {
    document.querySelectorAll("#spMapNodes .sp-map-node").forEach(button => {
      const locked = button.dataset.stageLocked === "true";
      button.disabled = locked || !!startingStageId;
      button.classList.toggle("is-stage-starting", button.dataset.stageId === startingStageId);
    });

    document.querySelectorAll("#spMapView .sp-map-detail-play").forEach(button => {
      const active = button.dataset.stageId === startingStageId;
      button.disabled = !!startingStageId;
      button.classList.toggle("is-stage-starting", active);
      button.setAttribute("aria-busy", String(active));
      button.textContent = active ? "Opening mission..." : (button.dataset.idleLabel || "Play");
    });
  }

  function setStartingStage(stageId) {
    startingStageId = stageId || null;
    syncStartingState();
  }

  function buildNode(stageNode) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sp-map-node sp-map-node-${stageNode.status}`;
    button.style.left = `${stageNode.map?.x ?? 50}%`;
    button.style.top = `${stageNode.map?.y ?? 50}%`;
    button.dataset.stageId = stageNode.id;
    button.dataset.stageLocked = String(stageNode.status === "locked");
    button.disabled = stageNode.status === "locked" || !!startingStageId;

    const label = document.createElement("div");
    label.className = "sp-map-node-label";
    label.textContent = stageNode.map?.label || stageNode.title;
    button.appendChild(label);

    if (stageNode.status === "locked") {
      const lock = document.createElement("div");
      lock.className = "sp-map-node-lock";
      lock.textContent = "Locked";
      button.appendChild(lock);
    } else if (stageNode.status === "completed") {
      const stars = document.createElement("div");
      stars.className = "sp-map-node-stars";
      stars.textContent = starGlyphs(stageNode.bestStars);
      button.appendChild(stars);
    }

    button.addEventListener("click", () => {
      if (stageNode.status === "locked" || startingStageId) return;
      showStageDetail(stageNode);
    });
    return button;
  }

  function clearDetail() {
    document.getElementById("spMapDetail")?.remove();
  }

  function showStageDetail(stageNode) {
    if (startingStageId) return;
    clearDetail();
    const container = document.getElementById("spMapView");
    if (!container) return;

    const detail = document.createElement("div");
    detail.id = "spMapDetail";
    detail.className = "sp-map-detail";

    const title = document.createElement("h3");
    title.className = "sp-map-detail-title";
    title.textContent = stageNode.title;
    detail.appendChild(title);

    const summary = document.createElement("p");
    summary.className = "sp-map-detail-summary";
    summary.textContent = stageNode.summary;
    detail.appendChild(summary);

    const meta = document.createElement("div");
    meta.className = "sp-map-detail-meta";
    const role = stageNode.role === "both"
      ? "Guesser & Secretkeeper"
      : stageNode.role === "setter" ? "Secretkeeper" : "Guesser";
    meta.textContent = `${role} - ${stageNode.difficultyLabel} - ${statusLabel(stageNode.status)}`;
    detail.appendChild(meta);

    if (stageNode.attempts > 0) {
      const record = document.createElement("div");
      record.className = "sp-map-detail-record";
      record.textContent = `Best: ${starGlyphs(stageNode.bestStars)}${stageNode.bestScore != null ? ` - ${stageNode.bestScore} pts` : ""} - ${stageNode.attempts} attempt${stageNode.attempts === 1 ? "" : "s"}`;
      detail.appendChild(record);
    }

    const actions = document.createElement("div");
    actions.className = "sp-map-detail-actions";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "sp-btn sp-map-detail-play";
    playBtn.dataset.stageId = stageNode.id;
    playBtn.dataset.idleLabel = stageNode.attempts > 0 ? "Replay" : "Play";
    playBtn.textContent = playBtn.dataset.idleLabel;
    playBtn.addEventListener("click", () => {
      if (startingStageId) return;
      window.SinglePlayerCampaign.startStage(stageNode.id);
    });
    actions.appendChild(playBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sp-btn sp-btn-secondary sp-map-detail-close";
    closeBtn.textContent = "Close";
    closeBtn.disabled = !!startingStageId;
    closeBtn.addEventListener("click", clearDetail);
    actions.appendChild(closeBtn);

    detail.appendChild(actions);
    container.appendChild(detail);
    syncStartingState();
  }

  function render(manifest) {
    clearDetail();
    const mapEl = document.getElementById("spMapNodes");
    if (!mapEl) return;
    mapEl.innerHTML = "";
    const stages = manifest?.stages || [];
    if (!stages.length) {
      const empty = document.createElement("div");
      empty.className = "sp-map-loading";
      empty.textContent = "No campaign stages available yet.";
      mapEl.appendChild(empty);
      return;
    }

    stages
      .slice()
      .sort((a, b) => (a.chapter - b.chapter) || (a.order - b.order))
      .forEach(stageNode => mapEl.appendChild(buildNode(stageNode)));
    syncStartingState();
  }

  window.SinglePlayerCampaignMap = { render, setStartingStage };
})();
