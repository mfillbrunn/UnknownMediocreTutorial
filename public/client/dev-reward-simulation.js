// client/dev-reward-simulation.js — Developer tool: run the server-side
// AI-vs-AI Power Choice reward benchmark
// (server/core/simulation/runRewardSimulation.js) and chart the results.
//
// Unlike dev-simulation.js's two charts, results here are NOT persisted to
// Supabase (there's no reward_simulations table -- neither of the other
// two simulators' tables were created via a migration file in this repo
// either, so there's nothing to model a new one on). The "Test All
// Rewards" batch response is cached in memory for the rest of this page
// visit and charted directly from that.

document.getElementById("devRewardSimulationBtn")?.addEventListener("click", () => {
  showScreen("rewardSimulationScreen");
  populateRsRewardSelect();
  updateRsTestAllEstimate();
});

// ------------------------------------------------------------------
// Single-reward run
// ------------------------------------------------------------------

let rsCatalogCache = {}; // "role:tier" -> [{id, label, icon}]

function rsCatalogKey(role, tier) {
  return `${role}:${tier}`;
}

function fetchRsCatalog(role, tier) {
  const key = rsCatalogKey(role, tier);
  if (rsCatalogCache[key]) return Promise.resolve(rsCatalogCache[key]);
  return new Promise((resolve) => {
    socket.emit("getRewardCatalog", { role, tier }, (res) => {
      const rewards = res?.ok ? res.rewards : [];
      rsCatalogCache[key] = rewards;
      resolve(rewards);
    });
  });
}

async function populateRsRewardSelect() {
  const role = document.getElementById("rsRoleSelect")?.value || "setter";
  const tier = parseInt(document.getElementById("rsTierSelect")?.value, 10) || 1;
  const select = document.getElementById("rsRewardSelect");
  if (!select) return;

  select.innerHTML = `<option>Loading…</option>`;
  const rewards = await fetchRsCatalog(role, tier);
  select.innerHTML = rewards.map((r) => `<option value="${r.id}">${r.icon || ""} ${r.label}</option>`).join("");
}

document.getElementById("rsRoleSelect")?.addEventListener("change", () => {
  populateRsRewardSelect();
  updateRsTestAllEstimate();
});
document.getElementById("rsTierSelect")?.addEventListener("change", () => {
  populateRsRewardSelect();
  updateRsTestAllEstimate();
});

function formatRsStats(stats) {
  const hasReward = stats.avgWithReward != null;
  const delta = hasReward ? stats.avgWithReward - stats.avgBaseline : null;
  const sign = delta > 0 ? "+" : "";
  const roleLabel = stats.role === "setter" ? "Secretkeeper" : "Guesser";
  const used = Number(stats.usedWithReward || 0);
  const useRate = Number.isFinite(Number(stats.useRate)) ? Number(stats.useRate) : 0;
  return `
    <div class="sim-result-header">${stats.icon || ""} ${stats.label} — Tier ${stats.tier}, ${roleLabel}</div>
    <div class="sim-result-row"><span>Measured round</span><span>Round ${stats.measuredRound || 2}</span></div>
    <div class="sim-result-row"><span>With reward</span><span>${hasReward ? `${stats.avgWithReward.toFixed(2)} avg (n=${stats.completedWithReward})` : "No usable trials"}</span></div>
    <div class="sim-result-row"><span>Baseline</span><span>${stats.avgBaseline == null ? "—" : `${stats.avgBaseline.toFixed(2)} avg (n=${stats.completedBaseline})`}</span></div>
    <div class="sim-result-row"><span>Reward used</span><span>${used}/${stats.runs} (${(useRate * 100).toFixed(0)}%)</span></div>
    <div class="sim-result-row"><span>Excluded</span><span>${stats.excludedWithReward || 0}</span></div>
    ${delta == null ? "" : `<div class="sim-result-row sim-result-delta"><span>Raw delta</span><span>${sign}${delta.toFixed(2)} guesses</span></div>`}
  `;
}

document.getElementById("rsRunBtn")?.addEventListener("click", () => {
  const userId = window.currentUser?.id;
  if (!userId) {
    window.toast?.("Log in first to run a simulation.");
    return;
  }

  const role = document.getElementById("rsRoleSelect")?.value;
  const tier = parseInt(document.getElementById("rsTierSelect")?.value, 10);
  const rewardId = document.getElementById("rsRewardSelect")?.value;
  if (!role || !tier || !rewardId) {
    window.toast?.("Pick a role, tier, and reward first.");
    return;
  }

  const runsInput = document.getElementById("rsRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  runsInput.value = runs;

  const aiDifficulty = parseInt(document.getElementById("rsDifficultySelect")?.value, 10) || 2;

  const runBtn = document.getElementById("rsRunBtn");
  const progress = document.getElementById("rsProgress");
  const progressFill = document.getElementById("rsProgressFill");
  const progressText = document.getElementById("rsProgressText");
  const results = document.getElementById("rsResults");

  runBtn.disabled = true;
  results.classList.add("hidden");
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = `Starting… (with reward 0/${runs})`;

  socket.emit(
    "runRewardSimulation",
    { userId, role, tier, rewardId, runs, aiDifficulty },
    (res) => {
      runBtn.disabled = false;
      progress.classList.add("hidden");

      if (!res?.ok) {
        window.toast?.(res?.error || "Simulation failed");
        return;
      }

      results.innerHTML = formatRsStats(res.stats);
      results.classList.remove("hidden");
    }
  );
});

socket.on("rewardSimulationProgress", (progress) => {
  const bar = document.getElementById("rsProgress");
  const fill = document.getElementById("rsProgressFill");
  const text = document.getElementById("rsProgressText");
  if (!bar || bar.classList.contains("hidden")) return;

  const stageDone = progress.stage === "baseline" ? progress.total : 0;
  const pct = Math.min(100, Math.round(((stageDone + progress.completed) / (progress.total * 2)) * 100));
  fill.style.width = `${pct}%`;

  const stageLabel = progress.stage === "with_reward" ? "with reward" : "baseline";
  text.textContent = `Running ${stageLabel}: ${progress.completed}/${progress.total}`;
});

// ------------------------------------------------------------------
// Test All Rewards: loops every reward matching the current role/tier
// filters (same runRewardSimulation code path, orchestrated server-side
// so the no-reward baseline is computed once per role and reused across
// every tier and reward of that role -- see runAllRewardSimulations).
// Results are cached in memory only and charted directly, since there's
// no table to persist them to.
// ------------------------------------------------------------------

let rsRoleFilter = "all";
let rsTierFilter = "all";
let rsResultsCache = null;

// Both roles now draw from the SAME pool at all three of their
// thresholds (see setterRewardPool/guesserRewardPool in
// powerChoiceServer.js) instead of a different catalog per tier --
// "tier" here only picks which threshold (and so which forced turn) the
// reward is tested at, not a different list. The one exception is the
// Guesser's Time Rewind card, which only enters the pool from tier 2
// onward -- hence 15/16/16 instead of a flat count.
const RS_CATALOG_COUNTS = {
  setter: { 1: 15, 2: 15, 3: 15 },
  guesser: { 1: 15, 2: 16, 3: 16 }
};

function rsCountsByFilter() {
  const roles = rsRoleFilter === "all" ? ["setter", "guesser"] : [rsRoleFilter];
  const tiers = rsTierFilter === "all" ? [1, 2, 3] : [Number(rsTierFilter)];
  let total = 0;
  for (const role of roles) {
    for (const tier of tiers) total += RS_CATALOG_COUNTS[role]?.[tier] || 0;
  }
  return { total, roles: roles.length };
}

function updateRsTestAllEstimate() {
  const estimateEl = document.getElementById("rsTestAllEstimate");
  if (!estimateEl) return;

  const runsInput = document.getElementById("rsRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  const { total, roles } = rsCountsByFilter();
  // ~100ms/trial, same rough estimate the power/quest simulators use --
  // one baseline batch per role, plus one batch per reward.
  const totalTrials = runs * (roles + total);
  const estSeconds = totalTrials * 0.1;
  const label = estSeconds < 60
    ? `~${Math.round(estSeconds)}s`
    : `~${(estSeconds / 60).toFixed(1)} min`;

  estimateEl.textContent = `Tests ${total} reward${total === 1 ? "" : "s"} — ${label}`;
}

document.getElementById("rsRunsInput")?.addEventListener("input", updateRsTestAllEstimate);

document.querySelectorAll("#rsRoleFilter .sim-role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#rsRoleFilter .sim-role-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    rsRoleFilter = btn.dataset.role;
    updateRsTestAllEstimate();
    renderRsChart();
  });
});

document.querySelectorAll("#rsTierFilter .sim-role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#rsTierFilter .sim-role-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    rsTierFilter = btn.dataset.tier;
    updateRsTestAllEstimate();
    renderRsChart();
  });
});

document.getElementById("rsSplitViewToggle")?.addEventListener("change", (e) => {
  const filterEl = document.getElementById("rsRoleFilter");
  if (filterEl) filterEl.style.visibility = e.target.checked ? "hidden" : "visible";
  renderRsChart();
});

document.getElementById("rsTestAllBtn")?.addEventListener("click", () => {
  const userId = window.currentUser?.id;
  if (!userId) {
    window.toast?.("Log in first to run a simulation.");
    return;
  }

  const runsInput = document.getElementById("rsRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  runsInput.value = runs;
  const aiDifficulty = parseInt(document.getElementById("rsDifficultySelect")?.value, 10) || 2;

  const testAllBtn = document.getElementById("rsTestAllBtn");
  const runBtn = document.getElementById("rsRunBtn");
  const progress = document.getElementById("rsBatchProgress");
  const progressFill = document.getElementById("rsBatchProgressFill");
  const progressText = document.getElementById("rsBatchProgressText");

  testAllBtn.disabled = true;
  runBtn.disabled = true;
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Starting…";

  socket.emit(
    "runAllRewardSimulations",
    { userId, runs, aiDifficulty, roleFilter: rsRoleFilter, tierFilter: rsTierFilter },
    (res) => {
      testAllBtn.disabled = false;
      runBtn.disabled = false;
      progress.classList.add("hidden");

      if (!res?.ok) {
        window.toast?.(res?.error || "Batch simulation failed");
        return;
      }

      rsResultsCache = res.results;
      window.toast?.(`Tested ${res.results.length} rewards.`);
      renderRsChart();
    }
  );
});

socket.on("rewardSimulationBatchProgress", (p) => {
  const progress = document.getElementById("rsBatchProgress");
  const fill = document.getElementById("rsBatchProgressFill");
  const text = document.getElementById("rsBatchProgressText");
  if (!progress || progress.classList.contains("hidden")) return;

  if (p.phase === "baseline") {
    text.textContent = `Computing ${p.role} baseline: ${p.completed}/${p.total}`;
    return;
  }

  if (p.phase === "reward") {
    const pct = Math.min(100, Math.round(((p.rewardIndex + p.completed / p.total) / p.totalRewards) * 100));
    fill.style.width = `${pct}%`;
    text.textContent = `Testing ${p.icon || ""} ${p.label || p.rewardId} (${p.rewardIndex + 1}/${p.totalRewards}): ${p.completed}/${p.total}`;
  }
});

// ------------------------------------------------------------------
// Chart -- reuses renderBarChart from dev-simulation.js. Positive value
// always means "the reward is working as intended for whoever holds it",
// same sign convention as computeEffectiveness there: a setter reward
// should raise the Guesser's guess count (raw delta already positive),
// a guesser reward should lower it (negated).
// ------------------------------------------------------------------

function rsComputeEffectiveness(row) {
  const avgWith = Number(row.avgWithReward);
  const avgBase = Number(row.avgBaseline);
  const rawDelta = avgWith - avgBase;
  const value = row.role === "guesser" ? -rawDelta : rawDelta;

  const semWith = computeStdErr(row.rawWithReward);
  const semBase = computeStdErr(row.rawBaseline);
  const sem = Math.sqrt(semWith ** 2 + semBase ** 2);

  return { value, sem };
}

function rsBuildChartDataset(rows, roleFilter, tierFilter) {
  return rows
    .filter(row => (roleFilter === "all" || row.role === roleFilter) && (tierFilter === "all" || row.tier === Number(tierFilter)))
    .map(row => {
      const { value, sem } = row.avgWithReward == null ? { value: NaN, sem: 0 } : rsComputeEffectiveness(row);
      return {
        id: row.rewardId.replace(/^power:/, ""),
        role: row.role,
        tier: row.tier,
        label: row.label,
        emoji: row.icon || "",
        value,
        sem,
        avgWith: row.avgWithReward == null ? null : Number(row.avgWithReward),
        avgBaseline: row.avgBaseline == null ? null : Number(row.avgBaseline),
        used: Number(row.usedWithReward || 0),
        useRate: Number(row.useRate || 0),
        excluded: Number(row.excludedWithReward || 0),
        n: row.completedWithReward || 0,
        ai: row.aiDifficulty ?? "—"
      };
    })
    .sort((a, b) => (Number.isFinite(b.value) ? b.value : -Infinity) - (Number.isFinite(a.value) ? a.value : -Infinity));
}

function rsBaselineLabel(rows, role) {
  const filtered = rows.filter((r) => role === "all" || r.role === role);
  if (!filtered.length) return "";
  const avg = filtered.reduce((s, r) => s + Number(r.avgBaseline), 0) / filtered.length;
  return `baseline ${avg.toFixed(2)} avg guesses`;
}

function rsRenderTable(container, title, rows, includeRole) {
  const renderer = window.renderSimulationTable;
  if (typeof renderer !== "function") {
    container.innerHTML = `<div class="sim-table-empty">Simulation table renderer is unavailable.</div>`;
    return;
  }
  renderer(container, {
    title,
    note: "Every reward is granted at its first valid moment in round 2. Positive effect helps the reward owner.",
    columns: [
      { label: "Reward", name: true, render: row => `${simTableEscape(row.emoji)} ${simTableEscape(row.label)}` },
      ...(includeRole ? [{ label: "Role", render: row => row.role === "setter" ? "Secretkeeper" : "Guesser" }] : []),
      { label: "Tier", numeric: true, key: "tier" },
      { label: "With", numeric: true, render: row => row.avgWith == null ? "—" : row.avgWith.toFixed(2) },
      { label: "Baseline", numeric: true, render: row => row.avgBaseline == null ? "—" : row.avgBaseline.toFixed(2) },
      { label: "Effect", numeric: true, render: row => simEffectCell(row.value) },
      { label: "Used", numeric: true, render: row => `${row.used}/${row.used + row.excluded}` },
      { label: "Trials", numeric: true, key: "n" },
      { label: "AI", numeric: true, key: "ai" }
    ],
    rows
  });
}

function renderRsChart() {
  const wrap = document.getElementById("rsChartWrap");
  if (!wrap) return;
  if (!rsResultsCache || !rsResultsCache.length) {
    wrap.innerHTML = `<div class="sim-table-empty">Run “Test All Rewards” above to see a table.</div>`;
    return;
  }
  const splitOn = document.getElementById("rsSplitViewToggle")?.checked;
  if (splitOn) {
    wrap.innerHTML = `<div class="sim-table-pair"><div id="rsTableGuesser"></div><div id="rsTableSetter"></div></div>`;
    rsRenderTable(document.getElementById("rsTableGuesser"), "Guesser rewards", rsBuildChartDataset(rsResultsCache, "guesser", rsTierFilter), false);
    rsRenderTable(document.getElementById("rsTableSetter"), "Secretkeeper rewards", rsBuildChartDataset(rsResultsCache, "setter", rsTierFilter), false);
    return;
  }
  rsRenderTable(wrap, "Reward strength", rsBuildChartDataset(rsResultsCache, rsRoleFilter, rsTierFilter), rsRoleFilter === "all");
}
