// public/single-player/campaign-map.js
//
// Renders the campaign map (SinglePlayerCampaign.manifest.stages) into
// #spMapNodes: one positioned node per stage, locked/available/completed
// styling driven by each node's own `status`. Every piece of text is set
// via textContent -- nothing here ever builds HTML from stage data.

(function () {
  "use strict";

  function starGlyphs(count) {
    const n = Math.max(0, Math.min(3, Number(count) || 0));
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  function statusLabel(status) {
    switch (status) {
      case "locked": return "Locked";
      case "completed": return "Completed";
      case "in_progress": return "In Progress";
      default: return "Available";
    }
  }

  function buildNode(stageNode) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `sp-map-node sp-map-node-${stageNode.status}`;
    btn.style.left = `${stageNode.map?.x ?? 50}%`;
    btn.style.top = `${stageNode.map?.y ?? 50}%`;
    btn.disabled = stageNode.status === "locked";

    const label = document.createElement("div");
    label.className = "sp-map-node-label";
    label.textContent = stageNode.map?.label || stageNode.title;
    btn.appendChild(label);

    if (stageNode.status === "locked") {
      const lock = document.createElement("div");
      lock.className = "sp-map-node-lock";
      lock.textContent = "🔒";
      btn.appendChild(lock);
    } else if (stageNode.status === "completed") {
      const stars = document.createElement("div");
      stars.className = "sp-map-node-stars";
      stars.textContent = starGlyphs(stageNode.bestStars);
      btn.appendChild(stars);
    }

    btn.addEventListener("click", () => {
      if (stageNode.status === "locked") return;
      showStageDetail(stageNode);
    });

    return btn;
  }

  function clearDetail() {
    const detail = document.getElementById("spMapDetail");
    if (detail) detail.remove();
  }

  function showStageDetail(stageNode) {
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
    const role = stageNode.role === "both" ? "Guesser & Secretkeeper" : stageNode.role === "setter" ? "Secretkeeper" : "Guesser";
    meta.textContent = `${role} · ${stageNode.difficultyLabel} · ${statusLabel(stageNode.status)}`;
    detail.appendChild(meta);

    if (stageNode.attempts > 0) {
      const record = document.createElement("div");
      record.className = "sp-map-detail-record";
      record.textContent = `Best: ${starGlyphs(stageNode.bestStars)}${stageNode.bestScore != null ? ` · ${stageNode.bestScore} pts` : ""} · ${stageNode.attempts} attempt${stageNode.attempts === 1 ? "" : "s"}`;
      detail.appendChild(record);
    }

    const actions = document.createElement("div");
    actions.className = "sp-map-detail-actions";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "sp-btn sp-map-detail-play";
    playBtn.textContent = stageNode.attempts > 0 ? "Replay" : "Play";
    playBtn.addEventListener("click", () => {
      playBtn.disabled = true;
      window.SinglePlayerCampaign.startStage(stageNode.id).finally(() => {
        playBtn.disabled = false;
      });
    });
    actions.appendChild(playBtn);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "sp-btn sp-btn-secondary sp-map-detail-close";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", clearDetail);
    actions.appendChild(closeBtn);

    detail.appendChild(actions);
    container.appendChild(detail);
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
  }

  window.SinglePlayerCampaignMap = { render };
})();
