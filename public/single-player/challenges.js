// UMT_CHALLENGES_V2
(function () {
  "use strict";

  const PROGRESS_KEY = "umtChallengeProgressV1";
  const SETTINGS_KEY = "umtChallengeSettingsV2";
  const DEFAULT_DIFFICULTY = "medium";

  let catalog = null;
  let starting = false;
  let roleFilter = "all";
  let selectedDifficultyId = DEFAULT_DIFFICULTY;
  let lastSelection = null;

  const achievementDefs = [
    {
      id: "first-clear",
      title: "Challenge Accepted",
      desc: "Clear any challenge difficulty.",
      test: state => state.clears >= 1
    },
    {
      id: "first-perfect",
      title: "Perfect Counter",
      desc: "Earn three stars on any challenge.",
      test: state => state.perfects >= 1
    },
    {
      id: "setter-master",
      title: "Break the Secretkeeper",
      desc: "Clear every AI Secretkeeper challenge on every difficulty.",
      test: state => state.setterComplete
    },
    {
      id: "guesser-master",
      title: "Outlast the Guesser",
      desc: "Clear every AI Guesser challenge on every difficulty.",
      test: state => state.guesserComplete
    },
    {
      id: "all-clear",
      title: "Gauntlet Cleared",
      desc: "Clear every challenge on every difficulty.",
      test: state => state.allCleared
    },
    {
      id: "all-stars",
      title: "Full Constellation",
      desc: "Collect all three stars everywhere.",
      test: state => state.allPerfect
    }
  ];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  async function accessToken() {
    try {
      const { data } = await window.supabaseClient.auth.getSession();
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function emitWithAuth(event, payload) {
    const token = await accessToken();
    if (!token) {
      return { ok: false, code: "UNAUTHENTICATED" };
    }

    return new Promise(resolve => {
      socket.timeout(8000).emit(
        event,
        { ...(payload || {}), accessToken: token },
        (error, result) => {
          resolve(error
            ? { ok: false, code: "CHALLENGE_TIMEOUT" }
            : (result || { ok: false, code: "EMPTY_RESPONSE" }));
        }
      );
    });
  }

  function errorMessage(result) {
    if (result?.error) return result.error;
    const messages = {
      UNAUTHENTICATED: "Sign in before starting a challenge.",
      UNKNOWN_CHALLENGE: "That challenge is no longer available.",
      UNKNOWN_DIFFICULTY: "Choose a valid challenge difficulty.",
      CHALLENGE_TIMEOUT: "The challenge server did not respond.",
      CHALLENGE_SESSION_NOT_FOUND: "The challenge room could not be opened."
    };
    return messages[result?.code] || "Could not start the challenge.";
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveProgress(progress) {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }

  function loadSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
      if (typeof value.difficulty === "string") selectedDifficultyId = value.difficulty;
      if (["all", "setter", "guesser"].includes(value.roleFilter)) roleFilter = value.roleFilter;
    } catch {
      selectedDifficultyId = DEFAULT_DIFFICULTY;
      roleFilter = "all";
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      difficulty: selectedDifficultyId,
      roleFilter
    }));
  }

  function bestStars(challengeId, difficultyId) {
    return Number(loadProgress()?.[challengeId]?.[difficultyId]?.stars) || 0;
  }

  function starGlyphs(value) {
    const stars = Math.max(0, Math.min(3, Number(value) || 0));
    return "★".repeat(stars) + "☆".repeat(3 - stars);
  }

  function selectedDifficulty() {
    const difficulties = catalog?.difficulties || [];
    return difficulties.find(item => item.id === selectedDifficultyId)
      || difficulties.find(item => item.id === DEFAULT_DIFFICULTY)
      || difficulties[0]
      || null;
  }

  function roleDetails(challenge) {
    if (challenge.powerRole === "setter") {
      return {
        aiRole: "AI Secretkeeper",
        playerRole: "Guesser",
        roleClass: "setter"
      };
    }
    return {
      aiRole: "AI Guesser",
      playerRole: "Secretkeeper",
      roleClass: "guesser"
    };
  }

  function progressRows() {
    const progress = loadProgress();
    const challenges = catalog?.challenges || [];
    const difficulties = catalog?.difficulties || [];
    return challenges.flatMap(challenge => difficulties.map(difficulty => ({
      challenge,
      difficulty,
      stars: Number(progress?.[challenge.id]?.[difficulty.id]?.stars) || 0
    })));
  }

  function achievementState() {
    const rows = progressRows();
    const byRole = role => rows.filter(row => row.challenge.powerRole === role);
    const roleComplete = role => {
      const matches = byRole(role);
      return matches.length > 0 && matches.every(row => row.stars >= 1);
    };
    return {
      clears: rows.filter(row => row.stars >= 1).length,
      perfects: rows.filter(row => row.stars >= 3).length,
      setterComplete: roleComplete("setter"),
      guesserComplete: roleComplete("guesser"),
      allCleared: rows.length > 0 && rows.every(row => row.stars >= 1),
      allPerfect: rows.length > 0 && rows.every(row => row.stars >= 3)
    };
  }

  function renderProgressSummary() {
    const element = document.getElementById("challengeProgressSummary");
    if (!element || !catalog) return;

    const rows = progressRows();
    const clears = rows.filter(row => row.stars >= 1).length;
    const stars = rows.reduce((sum, row) => sum + row.stars, 0);
    const totalStars = rows.length * 3;
    const percent = rows.length ? Math.round((clears / rows.length) * 100) : 0;

    element.innerHTML = `
      <div class="challenge-progress-ring" style="--challenge-progress:${percent}%" aria-label="${percent}% complete">
        <span>${percent}%</span>
      </div>
      <div class="challenge-progress-copy">
        <span class="challenge-progress-kicker">GAUNTLET PROGRESS</span>
        <strong>${clears} of ${rows.length} difficulties cleared</strong>
        <small>${stars} / ${totalStars} stars collected</small>
      </div>`;
  }

  function renderRoleFilters() {
    const container = document.getElementById("challengeRoleFilters");
    if (!container) return;
    const choices = [
      { id: "all", label: "All powers" },
      { id: "setter", label: "AI Secretkeeper" },
      { id: "guesser", label: "AI Guesser" }
    ];

    container.innerHTML = "";
    choices.forEach(choice => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `challenge-segment ${roleFilter === choice.id ? "is-selected" : ""}`;
      button.textContent = choice.label;
      button.setAttribute("aria-pressed", String(roleFilter === choice.id));
      button.addEventListener("click", () => {
        roleFilter = choice.id;
        saveSettings();
        renderCatalog();
      });
      container.appendChild(button);
    });
  }

  function renderDifficultyPicker() {
    const container = document.getElementById("challengeDifficultyPicker");
    if (!container || !catalog) return;

    if (!catalog.difficulties.some(item => item.id === selectedDifficultyId)) {
      selectedDifficultyId = selectedDifficulty()?.id || DEFAULT_DIFFICULTY;
    }

    container.innerHTML = "";
    catalog.difficulties.forEach(difficulty => {
      const selected = difficulty.id === selectedDifficultyId;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `challenge-difficulty-option ${selected ? "is-selected" : ""}`;
      button.setAttribute("aria-pressed", String(selected));
      button.innerHTML = `
        <strong>${escapeHtml(difficulty.label)}</strong>
        <span>AI level ${Number(difficulty.aiDifficulty) || 1}</span>
        <small>${Number(difficulty.powerTurns) || 0} powered turns</small>`;
      button.addEventListener("click", () => {
        selectedDifficultyId = difficulty.id;
        saveSettings();
        renderCatalog();
      });
      container.appendChild(button);
    });
  }

  function powerDots(total) {
    const count = Math.max(0, Number(total) || 0);
    return Array.from({ length: count }, () => '<span class="challenge-power-dot"></span>').join("");
  }

  function renderCatalog() {
    const list = document.getElementById("challengeList");
    if (!list || !catalog) return;

    renderProgressSummary();
    renderRoleFilters();
    renderDifficultyPicker();
    renderAchievements();

    const difficulty = selectedDifficulty();
    const visible = catalog.challenges.filter(challenge => (
      roleFilter === "all" || challenge.powerRole === roleFilter
    ));

    list.innerHTML = "";
    if (!difficulty || visible.length === 0) {
      list.innerHTML = '<div class="challenge-empty">No challenges match this filter.</div>';
      return;
    }

    visible.forEach(challenge => {
      const role = roleDetails(challenge);
      const turns = Number(difficulty.powerTurns) || 0;
      const stars = bestStars(challenge.id, difficulty.id);
      const card = document.createElement("article");
      card.className = `challenge-card challenge-card--${role.roleClass}`;
      card.innerHTML = `
        <div class="challenge-card-topline">
          <span class="challenge-card-icon" aria-hidden="true">${escapeHtml(challenge.icon || "AI")}</span>
          <span class="challenge-role-badge">${escapeHtml(role.aiRole)} power</span>
        </div>
        <h3>${escapeHtml(challenge.title)}</h3>
        <p class="challenge-card-summary">${escapeHtml(challenge.summary)}</p>
        <div class="challenge-matchup" aria-label="Starting matchup">
          <div><small>YOU START AS</small><strong>${escapeHtml(role.playerRole)}</strong></div>
          <span class="challenge-versus" aria-hidden="true">VS</span>
          <div><small>POWERED ROLE</small><strong>${escapeHtml(role.aiRole)}</strong></div>
        </div>
        <div class="challenge-effect-box">
          <span class="challenge-effect-label">POWER EFFECT</span>
          <p>${escapeHtml(challenge.effect)}</p>
        </div>
        <div class="challenge-power-window">
          <div>
            <span>Automatic power window</span>
            <strong>First ${turns} eligible ${turns === 1 ? "turn" : "turns"}</strong>
          </div>
          <div class="challenge-power-dots" aria-hidden="true">${powerDots(turns)}</div>
        </div>
        <p class="challenge-counterplay"><strong>Counterplay:</strong> ${escapeHtml(challenge.counterplay)}</p>
        <div class="challenge-card-footer">
          <div class="challenge-best">
            <small>${escapeHtml(difficulty.label)} best</small>
            <span aria-label="${stars} of 3 stars">${starGlyphs(stars)}</span>
          </div>
          <button class="sp-btn challenge-start-btn" type="button">
            Start ${escapeHtml(difficulty.label)}
          </button>
        </div>`;

      card.querySelector(".challenge-start-btn")?.addEventListener("click", () => {
        startChallenge(challenge, difficulty);
      });
      list.appendChild(card);
    });
  }

  function renderAchievements() {
    const list = document.getElementById("challengeAchievementsList");
    if (!list || !catalog) return;
    const state = achievementState();
    list.innerHTML = "";

    achievementDefs.forEach(definition => {
      const unlocked = Boolean(definition.test(state));
      const item = document.createElement("li");
      item.className = `challenge-achievement ${unlocked ? "is-unlocked" : "is-locked"}`;
      item.innerHTML = `
        <span class="challenge-achievement-icon" aria-hidden="true">${unlocked ? "✓" : "—"}</span>
        <span>
          <strong>${escapeHtml(definition.title)}</strong>
          <small>${escapeHtml(definition.desc)}</small>
        </span>`;
      list.appendChild(item);
    });
  }

  function showBrowser() {
    document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
    document.getElementById("challengeResultPanel")?.classList.add("hidden");
    document.getElementById("challengeBrowser")?.classList.remove("hidden");
  }

  function showCatalogError(message) {
    const list = document.getElementById("challengeList");
    if (list) {
      list.innerHTML = `<div class="challenge-empty challenge-error" role="alert">${escapeHtml(message)}</div>`;
    }
    if (typeof toast === "function") toast(message);
  }

  async function open() {
    window.showScreen("challengesScreen");
    showBrowser();

    const list = document.getElementById("challengeList");
    if (list && !catalog) {
      list.innerHTML = `
        <div class="challenge-loading" aria-live="polite">
          <span></span><span></span><span></span>
          <strong>Loading challenges</strong>
        </div>`;
    }

    if (!catalog) {
      const result = await emitWithAuth("singlePlayer:getChallenges", {});
      if (!result.ok) {
        showCatalogError(errorMessage(result));
        return;
      }
      catalog = result;
    }

    renderCatalog();
  }

  function setStarting(value) {
    starting = value;
    document.querySelectorAll(".challenge-start-btn").forEach(button => {
      button.disabled = value;
      button.setAttribute("aria-busy", String(value));
    });
  }

  async function startChallenge(challenge, difficulty) {
    if (starting) return;
    setStarting(true);
    lastSelection = { challenge, difficulty };

    try {
      const result = await emitWithAuth("singlePlayer:startChallenge", {
        challengeId: challenge.id,
        difficulty: difficulty.id,
        userName: window.myProfile?.username || window.currentUser?.email || null
      });
      if (!result.ok) {
        showCatalogError(errorMessage(result));
        return;
      }

      if (!window.SinglePlayerCampaign?.joinRoom || !window.SinglePlayerCampaign?.enterGameScreen) {
        throw new Error("Single-player game client is unavailable.");
      }

      window._challengeStarting = true;
      window.SinglePlayerCampaign.joinRoom(result.roomId);
      window.SinglePlayerCampaign.enterGameScreen();

      const begun = await emitWithAuth("singlePlayer:beginChallenge", { roomId: result.roomId });
      if (!begun.ok) {
        const message = errorMessage(begun);
        if (typeof toast === "function") toast(message);
        await open();
      }
    } catch (error) {
      const message = error?.message || "Could not start the challenge.";
      if (typeof toast === "function") toast(message);
      window.showScreen("challengesScreen");
      showBrowser();
    } finally {
      window._challengeStarting = false;
      setStarting(false);
    }
  }

  function recordResult(payload) {
    if (!payload?.challengeId || !payload?.difficulty) return;
    const progress = loadProgress();
    progress[payload.challengeId] ||= {};
    const previous = progress[payload.challengeId][payload.difficulty] || {};
    progress[payload.challengeId][payload.difficulty] = {
      stars: Math.max(Number(previous.stars) || 0, Number(payload.stars) || 0),
      bestMargin: Math.max(Number(previous.bestMargin) || -999, Number(payload.margin) || 0),
      updatedAt: new Date().toISOString()
    };
    saveProgress(progress);
  }

  function fallbackObjectives(payload) {
    const specialLabel = payload.powerRole === "setter"
      ? "Solve the powered round in 4 guesses or fewer"
      : "Earn at least 12 Secretkeeper stars in the powered round";
    return [
      { label: "Beat the AI across both roles", passed: payload.conditions?.win },
      { label: "Win by at least 3 guesses", passed: payload.conditions?.margin },
      { label: specialLabel, passed: payload.conditions?.special }
    ];
  }

  function showResult(payload) {
    recordResult(payload);
    window.showScreen("challengesScreen");
    document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
    document.getElementById("challengeBrowser")?.classList.add("hidden");
    const panel = document.getElementById("challengeResultPanel");
    panel?.classList.remove("hidden");

    const title = document.getElementById("challengeResultTitle");
    const summary = document.getElementById("challengeResultSummary");
    const stars = document.getElementById("challengeResultStars");
    const details = document.getElementById("challengeResultDetails");
    const replay = document.getElementById("challengeResultReplayBtn");

    if (title) title.textContent = payload.won ? "Challenge cleared" : "Challenge not cleared";
    if (summary) {
      const challengeTitle = payload.title || lastSelection?.challenge?.title || "Challenge";
      const difficultyLabel = payload.difficultyLabel
        || lastSelection?.difficulty?.label
        || payload.difficulty
        || "";
      summary.textContent = `${challengeTitle} · ${difficultyLabel}`;
    }
    if (stars) {
      stars.textContent = starGlyphs(payload.stars);
      stars.setAttribute("aria-label", `${Number(payload.stars) || 0} of 3 stars earned`);
    }
    if (details) {
      details.innerHTML = "";
      const objectives = Array.isArray(payload.objectives) && payload.objectives.length
        ? payload.objectives
        : fallbackObjectives(payload);
      objectives.forEach(objective => {
        const item = document.createElement("li");
        item.className = objective.passed ? "is-passed" : "is-failed";
        item.innerHTML = `
          <span class="challenge-result-check" aria-hidden="true">${objective.passed ? "✓" : "×"}</span>
          <span><strong>${escapeHtml(objective.label)}</strong>${objective.value ? `<small>${escapeHtml(objective.value)}</small>` : ""}</span>`;
        details.appendChild(item);
      });
    }
    if (replay) replay.disabled = !lastSelection;

    if (catalog) {
      renderProgressSummary();
      renderAchievements();
    }
  }

  function showAchievements() {
    document.getElementById("challengeBrowser")?.classList.add("hidden");
    document.getElementById("challengeResultPanel")?.classList.add("hidden");
    document.getElementById("challengeAchievementsPanel")?.classList.remove("hidden");
    renderAchievements();
  }

  function ready() {
    loadSettings();
    document.getElementById("challengesBtn")?.addEventListener("click", open);
    document.getElementById("challengesBackBtn")?.addEventListener("click", () => {
      window.showScreen("quickPlayScreen");
    });
    document.getElementById("challengeAchievementsBtn")?.addEventListener("click", showAchievements);
    document.getElementById("challengeAchievementsBackBtn")?.addEventListener("click", showBrowser);
    document.getElementById("challengeResultContinueBtn")?.addEventListener("click", open);
    document.getElementById("challengeResultReplayBtn")?.addEventListener("click", () => {
      if (lastSelection) startChallenge(lastSelection.challenge, lastSelection.difficulty);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }

  socket.on("singlePlayer:challengeResult", showResult);

  window.SinglePlayerChallenges = {
    open,
    renderCatalog,
    loadProgress
  };
})();
