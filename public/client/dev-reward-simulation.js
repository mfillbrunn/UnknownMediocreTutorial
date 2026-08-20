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
  const delta = stats.avgWithReward - stats.avgBaseline;
  const sign = delta > 0 ? "+" : "";
  const roleLabel = stats.role === "setter" ? "Spy (setter)" : "Inspector (guesser)";
  const withText = stats.avgWithReward == null
    ? `no completed trials (${stats.excludedWithReward} excluded — the round never reached turn ${stats.tier === 1 ? (stats.role === "setter" ? 3 : 2) : stats.tier === 2 ? (stats.role === "setter" ? 5 : 4) : (stats.role === "setter" ? 7 : 6)})`
    : `${stats.avgWithReward.toFixed(2)} avg (min ${stats.minWithReward}, max ${stats.maxWithReward}, n=${stats.completedWithReward}, excluded=${stats.excludedWithReward})`;
  return `
    <div class="sim-result-header">${stats.icon || ""} ${stats.label} — Tier ${stats.tier}, ${roleLabel}</div>
    <div class="sim-result-row">
      <span>With reward</span>
      <span>${withText}</span>
    </div>
    <div class="sim-result-row">
      <span>Baseline (no reward)</span>
      <span>${stats.avgBaseline.toFixed(2)} avg (min ${stats.minBaseline}, max ${stats.maxBaseline}, n=${stats.completedBaseline})</span>
    </div>
    ${stats.avgWithReward == null ? "" : `
    <div class="sim-result-row sim-result-delta">
      <span>Delta</span>
      <span>${sign}${delta.toFixed(2)} guesses</span>
    </div>`}
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

// The setter now draws from the SAME 15-item pool at all three thresholds
// (see setterRewardPool in powerChoiceServer.js) instead of a different
// catalog per tier -- "tier" here only picks which star threshold (and
// so which forced turn) the reward is tested at, not a different list.
const RS_CATALOG_COUNTS = {
  setter: { 1: 15, 2: 15, 3: 15 },
  guesser: { 1: 3, 2: 8, 3: 8 }
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
// should raise the Inspector's guess count (raw delta already positive),
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
    .filter((r) => (roleFilter === "all" || r.role === roleFilter) && (tierFilter === "all" || r.tier === Number(tierFilter)))
    .filter((r) => r.avgWithReward != null) // exclude rewards that never got a chance to fire
    .map((r) => {
      const { value, sem } = rsComputeEffectiveness(r);
      return {
        id: r.rewardId.replace(/^power:/, ""),
        role: r.role,
        tier: r.tier,
        label: r.label,
        emoji: r.icon || "",
        value,
        sem,
        n: r.completedWithReward || 0
      };
    })
    .sort((a, b) => a.value - b.value);
}

function rsBaselineLabel(rows, role) {
  const filtered = rows.filter((r) => role === "all" || r.role === role);
  if (!filtered.length) return "";
  const avg = filtered.reduce((s, r) => s + Number(r.avgBaseline), 0) / filtered.length;
  return `baseline ${avg.toFixed(2)} avg guesses`;
}

function renderRsChart() {
  const wrap = document.getElementById("rsChartWrap");
  if (!wrap) return;

  if (!rsResultsCache || !rsResultsCache.length) {
    wrap.innerHTML = `<div class="sim-chart-empty">Run "Test All Rewards" above to see a chart.</div>`;
    return;
  }

  const splitOn = document.getElementById("rsSplitViewToggle")?.checked;

  if (splitOn) {
    wrap.innerHTML = `
      <div class="sim-chart-pair">
        <div class="sim-chart-single">
          <div class="sim-chart-title">Inspector Rewards <span class="sim-chart-baseline">(${rsBaselineLabel(rsResultsCache, "guesser")})</span></div>
          <div class="sim-chart-svg-wrap" id="rsChartGuesser"></div>
        </div>
        <div class="sim-chart-single">
          <div class="sim-chart-title">Spy Rewards <span class="sim-chart-baseline">(${rsBaselineLabel(rsResultsCache, "setter")})</span></div>
          <div class="sim-chart-svg-wrap" id="rsChartSetter"></div>
        </div>
      </div>
    `;
    renderBarChart(document.getElementById("rsChartGuesser"), rsBuildChartDataset(rsResultsCache, "guesser", rsTierFilter));
    renderBarChart(document.getElementById("rsChartSetter"), rsBuildChartDataset(rsResultsCache, "setter", rsTierFilter));
  } else {
    const note = rsRoleFilter === "all"
      ? `Baseline (no reward) avg guesses — guesser ${(() => { const l = rsBaselineLabel(rsResultsCache, "guesser"); return l ? l.replace("baseline ", "").replace(" avg guesses", "") : "—"; })()} · setter ${(() => { const l = rsBaselineLabel(rsResultsCache, "setter"); return l ? l.replace("baseline ", "").replace(" avg guesses", "") : "—"; })()}`
      : rsBaselineLabel(rsResultsCache, rsRoleFilter) || "";
    wrap.innerHTML = `
      <div class="sim-chart-note">${note}</div>
      <div class="sim-chart-svg-wrap" id="rsChartSingle"></div>
    `;
    renderBarChart(document.getElementById("rsChartSingle"), rsBuildChartDataset(rsResultsCache, rsRoleFilter, rsTierFilter), {
      tooltipFor: (d) => {
        const sign = d.value >= 0 ? "+" : "";
        return `${d.emoji} ${d.label} (tier ${d.tier}, ${d.role}) — effectiveness ${sign}${d.value.toFixed(2)} ± ${d.sem.toFixed(2)} guesses (n=${d.n})`;
      }
    });
  }
}
