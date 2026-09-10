// UMT_CHALLENGES_V2
(function () {
  "use strict";

  const PROGRESS_KEY = "umtChallengeProgressV1";
  const SETTINGS_KEY = "umtChallengeSettingsV2";
  const DEFAULT_DIFFICULTY = "medium";

  let catalog = null;
  let starting = false;
  let selectedDifficultyId = DEFAULT_DIFFICULTY;
  let lastSelection = null;
  // Which challenge's briefing dialog is open, so a re-render (a result
  // landing, say) can refresh it in place instead of dropping it.
  let openChallengeId = null;
  // A scored result waiting for the end-of-match ceremony to finish before
  // it is shown (see showResult).
  let pendingResult = null;

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
    } catch {
      selectedDifficultyId = DEFAULT_DIFFICULTY;
    }
  }

  function saveSettings() {
    // The map shows both AI roles at once, so the old role filter is gone;
    // only the last difficulty picked is worth remembering.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      difficulty: selectedDifficultyId
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

  function powerDots(total) {
    const count = Math.max(0, Number(total) || 0);
    return Array.from({ length: count }, () => '<span class="challenge-power-dot"></span>').join("");
  }

  // How far through a single challenge the player is, across all three
  // difficulties. This is what the map node's art is driven by, so
  // "untouched / part-way / finished" is legible without opening anything.
  function challengeProgress(challenge) {
    const difficulties = catalog?.difficulties || [];
    const perDifficulty = difficulties.map(difficulty => ({
      difficulty,
      stars: bestStars(challenge.id, difficulty.id)
    }));
    const cleared = perDifficulty.filter(row => row.stars >= 1).length;
    const stars = perDifficulty.reduce((sum, row) => sum + row.stars, 0);
    const maxStars = perDifficulty.length * 3;
    const state = stars >= maxStars && maxStars > 0
      ? "is-mastered"
      : (cleared > 0 ? "is-started" : "is-untouched");
    return { perDifficulty, cleared, stars, maxStars, state };
  }

  function buildNode(challenge) {
    const role = roleDetails(challenge);
    const progress = challengeProgress(challenge);

    const pips = progress.perDifficulty.map(row => `
      <span class="challenge-node-pip challenge-node-pip--${row.stars}"
            title="${escapeHtml(row.difficulty.label)}: ${row.stars} of 3 stars">
        <b>${escapeHtml(String(row.difficulty.label || "").charAt(0))}</b>
      </span>`).join("");

    const node = document.createElement("button");
    node.type = "button";
    node.className = `challenge-node challenge-node--${role.roleClass} ${progress.state}`;
    node.dataset.challengeId = challenge.id;
    node.setAttribute(
      "aria-label",
      `${challenge.title}. ${progress.stars} of ${progress.maxStars} stars. Open briefing.`
    );
    node.innerHTML = `
      <span class="challenge-node-medal" aria-hidden="true">
        <span class="challenge-node-icon">${escapeHtml(challenge.icon || "AI")}</span>
        ${progress.state === "is-mastered" ? '<span class="challenge-node-crown">★</span>' : ""}
      </span>
      <span class="challenge-node-title">${escapeHtml(challenge.title)}</span>
      <span class="challenge-node-pips" aria-hidden="true">${pips}</span>`;

    node.addEventListener("click", () => openDetail(challenge));
    return node;
  }

  function buildRegion(label, kicker, challenges, roleClass) {
    const region = document.createElement("section");
    region.className = `challenge-region challenge-region--${roleClass}`;
    region.innerHTML = `
      <header class="challenge-region-head">
        <span class="challenge-region-kicker">${escapeHtml(kicker)}</span>
        <h3>${escapeHtml(label)}</h3>
      </header>
      <div class="challenge-region-nodes"></div>`;
    const holder = region.querySelector(".challenge-region-nodes");
    challenges.forEach(challenge => holder.appendChild(buildNode(challenge)));
    return region;
  }

  // The map replaced a scrolling stack of full-detail cards -- eleven of
  // them, each carrying its own effect/counterplay/matchup copy, which made
  // simply finding a challenge a long scroll. The briefing moved into
  // openDetail's dialog; what's left out here is only what you need to
  // choose: which power, whose role, and how far along you are.
  function renderMap() {
    const map = document.getElementById("challengeMap");
    if (!map || !catalog) return;

    renderProgressSummary();
    renderAchievements();

    map.innerHTML = "";
    const setterChallenges = catalog.challenges.filter(c => c.powerRole === "setter");
    const guesserChallenges = catalog.challenges.filter(c => c.powerRole === "guesser");

    if (!catalog.challenges.length) {
      map.innerHTML = '<div class="challenge-empty">No challenges are available.</div>';
      return;
    }

    if (setterChallenges.length) {
      map.appendChild(buildRegion(
        "AI Secretkeeper powers",
        "YOU PLAY GUESSER FIRST",
        setterChallenges,
        "setter"
      ));
    }
    if (guesserChallenges.length) {
      map.appendChild(buildRegion(
        "AI Guesser powers",
        "YOU PLAY SECRETKEEPER FIRST",
        guesserChallenges,
        "guesser"
      ));
    }
  }

  // Kept as the module's public render entry point -- callers (showResult,
  // the result screen's Continue) just want "redraw whatever is on screen".
  function renderCatalog() {
    renderMap();
    if (openChallengeId) {
      const challenge = catalog?.challenges?.find(item => item.id === openChallengeId);
      if (challenge) renderDetail(challenge);
    }
  }

  // ---- Challenge briefing dialog -------------------------------------

  function detailModal() {
    return document.getElementById("challengeDetailModal");
  }

  function renderDetail(challenge) {
    const role = roleDetails(challenge);
    const progress = challengeProgress(challenge);

    const icon = document.getElementById("challengeDetailIcon");
    if (icon) icon.textContent = challenge.icon || "AI";

    const roleEl = document.getElementById("challengeDetailRole");
    if (roleEl) roleEl.textContent = `${role.aiRole} power`;

    const title = document.getElementById("challengeDetailTitle");
    if (title) title.textContent = challenge.title;

    const summary = document.getElementById("challengeDetailSummary");
    if (summary) summary.textContent = challenge.summary;

    const effect = document.getElementById("challengeDetailEffect");
    if (effect) effect.textContent = challenge.effect;

    const counterplay = document.getElementById("challengeDetailCounterplay");
    if (counterplay) {
      counterplay.innerHTML = `<strong>Counterplay:</strong> ${escapeHtml(challenge.counterplay)}`;
    }

    const matchup = document.getElementById("challengeDetailMatchup");
    if (matchup) {
      matchup.innerHTML = `
        <div><small>YOU START AS</small><strong>${escapeHtml(role.playerRole)}</strong></div>
        <span class="challenge-versus" aria-hidden="true">VS</span>
        <div><small>POWERED ROLE</small><strong>${escapeHtml(role.aiRole)}</strong></div>`;
    }

    const holder = document.getElementById("challengeDetailDifficulties");
    if (!holder) return;
    holder.innerHTML = "";

    progress.perDifficulty.forEach(({ difficulty, stars }) => {
      const turns = Number(difficulty.powerTurns) || 0;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sp-btn challenge-detail-difficulty challenge-start-btn ${stars >= 3 ? "is-mastered" : ""}`;
      button.innerHTML = `
        <span class="challenge-detail-difficulty-head">
          <strong>${escapeHtml(difficulty.label)}</strong>
          <span class="challenge-stars" aria-label="${stars} of 3 stars">${starGlyphs(stars)}</span>
        </span>
        <span class="challenge-detail-difficulty-meta">
          AI level ${Number(difficulty.aiDifficulty) || 1} · ${turns} powered ${turns === 1 ? "turn" : "turns"}
        </span>
        <span class="challenge-power-dots" aria-hidden="true">${powerDots(turns)}</span>`;
      button.addEventListener("click", () => {
        selectedDifficultyId = difficulty.id;
        saveSettings();
        startChallenge(challenge, difficulty);
      });
      holder.appendChild(button);
    });
  }

  function openDetail(challenge) {
    const modal = detailModal();
    if (!modal) return;
    openChallengeId = challenge.id;
    renderDetail(challenge);
    modal.classList.remove("hidden");
    document.getElementById("challengeDetailCloseBtn")?.focus?.();
  }

  function closeDetail() {
    openChallengeId = null;
    detailModal()?.classList.add("hidden");
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
    closeDetail();
    document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
    document.getElementById("challengeResultPanel")?.classList.add("hidden");
    document.getElementById("challengeBrowser")?.classList.remove("hidden");
  }

  function showCatalogError(message) {
    const map = document.getElementById("challengeMap");
    if (map) {
      map.innerHTML = `<div class="challenge-empty challenge-error" role="alert">${escapeHtml(message)}</div>`;
    }
    if (typeof toast === "function") toast(message);
  }

  async function open() {
    window.showScreen("challengesScreen");
    showBrowser();

    const map = document.getElementById("challengeMap");
    if (map && !catalog) {
      map.innerHTML = `
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
    // A fresh attempt always gets a fresh room (see joinRoom below setting
    // window.roomId to it), which already makes the guard in client.js's
    // updateScreens() stop applying on its own -- cleared here too as
    // plain hygiene, same as this file's own _challengeStarting reset.
    window._challengeRoomFinished = null;

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

      // The briefing has done its job the moment the match starts -- left
      // open it would sit on top of the board.
      closeDetail();
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

  // The server scores a challenge the moment the match ends, which is the
  // same moment the client STARTS its end-of-match ceremony: the winning
  // row flips, then the "secret found" popup, then the summary. Presenting
  // the result on arrival navigated straight off the board mid-flip, so
  // neither the reveal nor the summary was ever seen. Hold it until
  // client.js says the ceremony is done, then show it -- with a way back
  // to the summary from there (see the View summary button).
  //
  // Progress is still recorded immediately: it is what the map reads, and
  // it must not depend on the player sitting through an animation.
  function showResult(payload) {
    recordResult(payload);
    pendingResult = payload;
    waitForCeremony();
  }

  // Waiting on `_gameOverRevealInFlight` alone is not enough: this result
  // can arrive on its own socket event BEFORE the client has processed the
  // game-over state that starts the ceremony, and at that instant the flag
  // is still false -- indistinguishable from "the ceremony is over". So
  // poll instead, and only present once the client agrees the match is
  // over AND nothing is mid-reveal. A match that ends with no reveal at
  // all (nobody's secret was found) satisfies that immediately.
  //
  // The cap is a safety net, not the normal path: if the game-over state
  // never lands, the result is still shown rather than lost.
  const CEREMONY_POLL_MS = 250;
  const CEREMONY_MAX_WAIT_MS = 12000;
  let ceremonyTimer = null;

  function stopWaiting() {
    clearInterval(ceremonyTimer);
    ceremonyTimer = null;
  }

  function waitForCeremony() {
    stopWaiting();
    const startedAt = Date.now();
    ceremonyTimer = setInterval(() => {
      if (!pendingResult) return stopWaiting();

      const matchOver = window.state?.phase === "gameOver";
      const revealing = !!window._gameOverRevealInFlight;
      const timedOut = Date.now() - startedAt >= CEREMONY_MAX_WAIT_MS;

      if ((matchOver && !revealing) || timedOut) {
        stopWaiting();
        presentResult(pendingResult);
      }
    }, CEREMONY_POLL_MS);
  }

  function presentResult(payload) {
    pendingResult = null;
    stopWaiting();
    // The finished match's own room can still be lingering in the
    // background (the server's end-of-match reveal ceremony schedules a
    // screen update of its OWN several seconds out -- see client.js's
    // updateScreens() -- to hold the board up long enough for the
    // winning tile-flip to actually play before it forces the summary
    // screen on). That later callback has no idea the player has since
    // navigated here, so without this it can yank them back to the game
    // screen (or the summary) well after they've already moved on. Same
    // guard/reasoning as _asyncInviteRoomId's own precedent in
    // client.js's updateScreens(): scoped to this exact room, so it stops
    // applying on its own the moment a fresh challenge claims a new one.
    window._challengeRoomFinished = window.roomId;
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
      closeDetail();
      window.showScreen("quickPlayScreen");
    });
    document.getElementById("challengeAchievementsBtn")?.addEventListener("click", showAchievements);
    document.getElementById("challengeAchievementsBackBtn")?.addEventListener("click", showBrowser);
    document.getElementById("challengeResultContinueBtn")?.addEventListener("click", open);
    document.getElementById("challengeResultReplayBtn")?.addEventListener("click", () => {
      if (lastSelection) startChallenge(lastSelection.challenge, lastSelection.difficulty);
    });

    // The match summary is the #menu screen, already filled in by
    // updateSummary() during the ceremony -- this just returns to it, so
    // the result is a stop on the way out of the match rather than a
    // replacement for looking at how the match actually went.
    document.getElementById("challengeResultSummaryBtn")?.addEventListener("click", () => {
      window.showScreen("menu");
    });

    // Backdrop and the × both carry data-challenge-detail-close, so one
    // handler covers every way out of the briefing except Escape.
    detailModal()?.addEventListener("click", event => {
      if (event.target.closest("[data-challenge-detail-close]")) closeDetail();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && openChallengeId) closeDetail();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }

  socket.on("singlePlayer:challengeResult", showResult);

  // The reveal + "secret found" popup + summary have all played out; now
  // the result can take the screen without stepping on any of them.
  window.addEventListener("gameOverRevealDone", () => {
    if (pendingResult) presentResult(pendingResult);
  });

  window.SinglePlayerChallenges = {
    open,
    renderCatalog,
    loadProgress
  };
})();
