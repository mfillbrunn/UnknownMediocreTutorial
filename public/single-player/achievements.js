// public/single-player/achievements.js
//
// Renders the achievements list carried on the campaign manifest
// (SinglePlayerCampaign.manifest.achievements -- see publicState.js's
// buildCampaignManifest) into #spAchievementsList. Achievements track
// both campaign and multiplayer activity, so this view works whether or
// not the player has touched the campaign yet.

(function () {
  "use strict";

  function render(manifest) {
    const list = document.getElementById("spAchievementsList");
    if (!list) return;
    list.innerHTML = "";

    const achievements = manifest?.achievements || [];
    if (!achievements.length) {
      const li = document.createElement("li");
      li.className = "sp-achievement-empty";
      li.textContent = "No achievements available yet.";
      list.appendChild(li);
      return;
    }

    achievements.forEach(achievement => {
      const unlocked = !!achievement.unlockedAt;
      const li = document.createElement("li");
      li.className = `sp-achievement-row ${unlocked ? "sp-achievement-unlocked" : "sp-achievement-locked"}`;

      const icon = document.createElement("span");
      icon.className = "sp-achievement-icon";
      icon.textContent = unlocked ? "🏆" : "🔒";
      li.appendChild(icon);

      const body = document.createElement("div");
      body.className = "sp-achievement-body";

      const title = document.createElement("div");
      title.className = "sp-achievement-title";
      title.textContent = achievement.title;
      body.appendChild(title);

      const desc = document.createElement("div");
      desc.className = "sp-achievement-desc";
      desc.textContent = achievement.description;
      body.appendChild(desc);

      const progressValue = Math.min(achievement.progressValue || 0, achievement.targetValue || 0);
      const progress = document.createElement("div");
      progress.className = "sp-achievement-progress";
      progress.textContent = unlocked
        ? "Complete"
        : `${progressValue} / ${achievement.targetValue} ${achievement.unit || ""}`.trim();
      body.appendChild(progress);

      li.appendChild(body);
      list.appendChild(li);
    });
  }

  window.SinglePlayerAchievements = { render };
})();
