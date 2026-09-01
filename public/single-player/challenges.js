// UMT_CHALLENGES_V1
(function () {
  "use strict";

  // UMT_REQUESTED_FIXES_20260901: CHALLENGE PANEL STATE

  const STORAGE_KEY = "umtChallengeProgressV1";
  let catalog = null;
  let selectedChallenge = null;
  let starting = false;

  async function token() {
    try {
      const { data } = await window.supabaseClient.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  }

  async function emit(event, payload) {
    const accessToken = await token();
    if (!accessToken) return { ok: false, error: "Sign in to play Challenges." };
    return new Promise(resolve => {
      socket.timeout(8000).emit(event, { ...(payload || {}), accessToken }, (err, result) => {
        resolve(err ? { ok: false, error: "Challenge server did not respond." } : (result || { ok: false }));
      });
    });
  }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function saveProgress(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }
  function bestStars(challengeId, difficulty) {
    return Number(loadProgress()?.[challengeId]?.[difficulty]?.stars) || 0;
  }
  function glyphs(n) {
    n = Math.max(0, Math.min(3, Number(n) || 0));
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  const achievementDefs = [
    { id: "first-clear", title: "Challenge Accepted", desc: "Clear your first challenge.", test: x => x.clears >= 1 },
    { id: "first-perfect", title: "Three-Star Finish", desc: "Earn three stars on a challenge difficulty.", test: x => x.perfects >= 1 },
    { id: "rank-one", title: "One-Star Rank", desc: "Earn at least one star on every challenge difficulty.", test: x => x.allAtLeast1 },
    { id: "rank-two", title: "Two-Star Rank", desc: "Earn at least two stars on every challenge difficulty.", test: x => x.allAtLeast2 },
    { id: "rank-three", title: "Three-Star Rank", desc: "Earn three stars on every challenge difficulty.", test: x => x.allAtLeast3 },
    { id: "easy-complete", title: "Easy Sweep", desc: "Clear every challenge on Easy.", test: x => x.byDifficulty.easy },
    { id: "medium-complete", title: "Medium Sweep", desc: "Clear every challenge on Medium.", test: x => x.byDifficulty.medium },
    { id: "hard-complete", title: "Hard Sweep", desc: "Clear every challenge on Hard.", test: x => x.byDifficulty.hard },
    { id: "setter-powers", title: "Setter Power Master", desc: "Clear every AI setter-power challenge on all difficulties.", test: x => x.setterComplete },
    { id: "guesser-powers", title: "Guesser Power Master", desc: "Clear every AI guesser-power challenge on all difficulties.", test: x => x.guesserComplete },
    { id: "all-challenges", title: "Challenge Master", desc: "Clear every challenge on every difficulty.", test: x => x.allCleared },
    { id: "all-stars", title: "Constellation", desc: "Collect every challenge star.", test: x => x.allAtLeast3 }
  ];

  function achievementState() {
    const progress = loadProgress();
    const challenges = catalog?.challenges || [];
    const diffs = (catalog?.difficulties || []).map(d => d.id);
    const rows = challenges.flatMap(c => diffs.map(d => ({ c, d, stars: Number(progress?.[c.id]?.[d]?.stars) || 0 })));
    const roleRows = role => rows.filter(r => r.c.powerRole === role);
    const allRole = role => {
      const rs = roleRows(role);
      return rs.length > 0 && rs.every(r => r.stars >= 1);
    };
    return {
      clears: rows.filter(r => r.stars >= 1).length,
      perfects: rows.filter(r => r.stars >= 3).length,
      allAtLeast1: rows.length > 0 && rows.every(r => r.stars >= 1),
      allAtLeast2: rows.length > 0 && rows.every(r => r.stars >= 2),
      allAtLeast3: rows.length > 0 && rows.every(r => r.stars >= 3),
      allCleared: rows.length > 0 && rows.every(r => r.stars >= 1),
      setterComplete: allRole("setter"),
      guesserComplete: allRole("guesser"),
      byDifficulty: Object.fromEntries(diffs.map(d => [d, challenges.length > 0 && challenges.every(c => (Number(progress?.[c.id]?.[d]?.stars) || 0) >= 1)]))
    };
  }

  function renderAchievements() {
    const list = document.getElementById("challengeAchievementsList");
    if (!list || !catalog) return;
    const state = achievementState();
    list.innerHTML = "";
    achievementDefs.forEach(a => {
      const ok = !!a.test(state);
      const li = document.createElement("li");
      li.className = `challenge-achievement ${ok ? "is-unlocked" : "is-locked"}`;
      li.innerHTML = `<span class="challenge-achievement-icon">${ok ? "🏆" : "🔒"}</span><span><strong>${a.title}</strong><small>${a.desc}</small></span>`;
      list.appendChild(li);
    });
  }

  function renderCatalog() {
    const list = document.getElementById("challengeList");
    if (!list || !catalog) return;
    list.innerHTML = "";
    for (const challenge of catalog.challenges) {
      const card = document.createElement("article");
      card.className = "challenge-card";
      const roleText = challenge.powerRole === "setter" ? "AI Secretkeeper power" : "AI Guesser power";
      card.innerHTML = `
        <div class="challenge-card-head"><span class="challenge-card-icon">${challenge.icon || "⚡"}</span><div><h3>${challenge.title}</h3><small>${roleText}</small></div></div>
        <p>${challenge.summary}</p>
        <div class="challenge-difficulties"></div>`;
      const row = card.querySelector(".challenge-difficulties");
      catalog.difficulties.forEach(diff => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sp-btn challenge-difficulty-btn";
        btn.innerHTML = `<span>${diff.label}</span><span class="challenge-stars">${glyphs(bestStars(challenge.id, diff.id))}</span>`;
        btn.onclick = () => start(challenge, diff);
        row.appendChild(btn);
      });
      list.appendChild(card);
    }
    renderAchievements();
  }

  async function open() {
    window.showScreen("challengesScreen");
    document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
    document.getElementById("challengeResultPanel")?.classList.add("hidden");
    document.getElementById("challengeBrowser")?.classList.remove("hidden");
    if (!catalog) {
      const result = await emit("singlePlayer:getChallenges", {});
      if (!result.ok) {
        if (typeof toast === "function") toast(result.error || "Could not load Challenges.");
        return;
      }
      catalog = result;
    }
    renderCatalog();
  }

  async function start(challenge, diff) {
    if (starting) return;
    starting = true;
    selectedChallenge = { challenge, diff };
    document.querySelectorAll(".challenge-difficulty-btn").forEach(b => b.disabled = true);
    try {
      const result = await emit("singlePlayer:startChallenge", {
        challengeId: challenge.id,
        difficulty: diff.id,
        userName: window.myProfile?.username || window.currentUser?.email || null
      });
      if (!result.ok) {
        if (typeof toast === "function") toast(result.error || "Could not start challenge.");
        return;
      }
      window.SinglePlayerCampaign.joinRoom(result.roomId);
      window.SinglePlayerCampaign.enterGameScreen();
      const begun = await emit("singlePlayer:beginChallenge", { roomId: result.roomId });
      if (!begun.ok) {
        if (typeof toast === "function") toast(begun.error || "Could not enter challenge.");
        await open();
      }
    } finally {
      starting = false;
      document.querySelectorAll(".challenge-difficulty-btn").forEach(b => b.disabled = false);
    }
  }

  function recordResult(payload) {
    const p = loadProgress();
    p[payload.challengeId] ||= {};
    const old = Number(p[payload.challengeId]?.[payload.difficulty]?.stars) || 0;
    p[payload.challengeId][payload.difficulty] = {
      stars: Math.max(old, Number(payload.stars) || 0),
      bestMargin: Math.max(Number(p[payload.challengeId]?.[payload.difficulty]?.bestMargin) || -999, Number(payload.margin) || 0),
      updatedAt: new Date().toISOString()
    };
    saveProgress(p);
  }

  function showResult(payload) {
    recordResult(payload);
    window.showScreen("challengesScreen");
    document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
    document.getElementById("challengeBrowser")?.classList.add("hidden");
    const panel = document.getElementById("challengeResultPanel");
    panel?.classList.remove("hidden");
    const title = document.getElementById("challengeResultTitle");
    const stars = document.getElementById("challengeResultStars");
    const details = document.getElementById("challengeResultDetails");
    if (title) title.textContent = payload.won ? "Challenge cleared" : "Challenge failed";
    if (stars) stars.textContent = glyphs(payload.stars);
    if (details) {
      const special = payload.powerRole === "setter"
        ? `Guess within 4: ${payload.conditions?.special ? "✓" : "✗"} (${payload.humanGuessCount || 0} guesses)`
        : `Earn 12 setter stars: ${payload.conditions?.special ? "✓" : "✗"} (${payload.setterStars || 0})`;
      details.innerHTML = `
        <li>${payload.conditions?.win ? "✓" : "✗"} Beat the AI</li>
        <li>${payload.conditions?.margin ? "✓" : "✗"} Win by 3 points (${payload.margin >= 0 ? "+" : ""}${payload.margin || 0})</li>
        <li>${special}</li>`;
    }
    renderCatalog();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("challengesBtn")?.addEventListener("click", open);
    document.getElementById("challengesBackBtn")?.addEventListener("click", () => window.showScreen("playScreen"));
    document.getElementById("challengeAchievementsBtn")?.addEventListener("click", () => {
      document.getElementById("challengeBrowser")?.classList.add("hidden");
      document.getElementById("challengeAchievementsPanel")?.classList.remove("hidden");
      renderAchievements();
    });
    document.getElementById("challengeAchievementsBackBtn")?.addEventListener("click", () => {
      document.getElementById("challengeAchievementsPanel")?.classList.add("hidden");
      document.getElementById("challengeBrowser")?.classList.remove("hidden");
    });
    document.getElementById("challengeResultContinueBtn")?.addEventListener("click", open);
  });

  socket.on("singlePlayer:challengeResult", showResult);
  window.SinglePlayerChallenges = { open, renderCatalog, loadProgress };
})();
