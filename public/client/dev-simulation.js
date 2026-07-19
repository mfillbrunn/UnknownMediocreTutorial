// client/dev-simulation.js — Developer tool: run the server-side AI-vs-AI
// power benchmark (server/core/simulation/runPowerSimulation.js) and show
// the results, plus a history of past runs read straight from Supabase
// (same direct-read pattern statistics.js uses for the leaderboard).
//
// Reuses DEV_SETTER_POWERS/DEV_GUESSER_POWERS from dev-powers.js as the
// testable power list — same pool the "Dev Mode" power picker already
// offers, so it stays in sync with that list for free instead of
// maintaining a third copy.

document.getElementById("developerBtn")?.addEventListener("click", () => {
  showScreen("developerScreen");
});

document.getElementById("devPlayBtn")?.addEventListener("click", () => {
  showScreen("playScreen");
});

document.getElementById("devSimulationBtn")?.addEventListener("click", () => {
  showScreen("simulationScreen");
  populateSimPowerSelect();
  loadPastSimulations();
  loadChartData();
  updateSimTestAllEstimate();
});

function populateSimPowerSelect() {
  const select = document.getElementById("simPowerSelect");
  if (!select || select.options.length) return; // built once

  const ids = [...DEV_SETTER_POWERS, ...DEV_GUESSER_POWERS];
  select.innerHTML = ids.map(id => {
    const meta = window.POWER_METADATA?.[id];
    return `<option value="${id}">${meta?.emoji || ""} ${meta?.label || id}</option>`;
  }).join("");

  select.addEventListener("change", updateSimPowerRoleLabel);
  updateSimPowerRoleLabel();
}

function getPowerRole(powerId) {
  return window.PowerEngine?.powers?.[powerId]?.role || null;
}

function updateSimPowerRoleLabel() {
  const select = document.getElementById("simPowerSelect");
  const label = document.getElementById("simPowerRoleLabel");
  if (!select || !label) return;
  const role = getPowerRole(select.value);
  label.textContent = role
    ? `Held by the ${role === "setter" ? "Spy (setter)" : "Inspector (guesser)"} for the whole run`
    : "";
}

function formatSimStats(stats) {
  const delta = stats.avgWithPower - stats.avgWithoutPower;
  const sign = delta > 0 ? "+" : "";
  const meta = window.POWER_METADATA?.[stats.powerId];
  return `
    <div class="sim-result-header">${meta?.emoji || ""} ${meta?.label || stats.powerId} — ${stats.powerRole}</div>
    <div class="sim-result-row">
      <span>With power</span>
      <span>${stats.avgWithPower.toFixed(2)} avg (min ${stats.minWithPower}, max ${stats.maxWithPower}, n=${stats.completedWithPower})</span>
    </div>
    <div class="sim-result-row">
      <span>Without power</span>
      <span>${stats.avgWithoutPower.toFixed(2)} avg (min ${stats.minWithoutPower}, max ${stats.maxWithoutPower}, n=${stats.completedWithoutPower})</span>
    </div>
    <div class="sim-result-row sim-result-delta">
      <span>Delta</span>
      <span>${sign}${delta.toFixed(2)} guesses</span>
    </div>
  `;
}

document.getElementById("simRunBtn")?.addEventListener("click", () => {
  const userId = window.currentUser?.id;
  if (!userId) {
    window.toast?.("Log in first to run a simulation.");
    return;
  }

  const powerId = document.getElementById("simPowerSelect")?.value;
  const powerRole = getPowerRole(powerId);
  if (!powerId || !powerRole) return;

  const runsInput = document.getElementById("simRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  runsInput.value = runs;

  const aiDifficulty = parseInt(document.getElementById("simDifficultySelect")?.value, 10) || 2;

  const runBtn = document.getElementById("simRunBtn");
  const progress = document.getElementById("simProgress");
  const progressFill = document.getElementById("simProgressFill");
  const progressText = document.getElementById("simProgressText");
  const results = document.getElementById("simResults");

  runBtn.disabled = true;
  results.classList.add("hidden");
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = `Starting… (with power 0/${runs})`;

  socket.emit(
    "runPowerSimulation",
    { userId, powerId, powerRole, runs, aiDifficulty },
    (res) => {
      runBtn.disabled = false;
      progress.classList.add("hidden");

      if (!res?.ok) {
        window.toast?.(res?.error || "Simulation failed");
        return;
      }

      results.innerHTML = formatSimStats(res.stats);
      results.classList.remove("hidden");

      if (!res.saved) {
        window.toast?.("Simulation finished, but saving to Supabase failed — see console.");
      }

      loadPastSimulations(true);
    }
  );
});

socket.on("powerSimulationProgress", (progress) => {
  const bar = document.getElementById("simProgress");
  const fill = document.getElementById("simProgressFill");
  const text = document.getElementById("simProgressText");
  if (!bar || bar.classList.contains("hidden")) return;

  const stageDone = progress.stage === "without_power" ? progress.total : 0;
  const pct = Math.min(100, Math.round(((stageDone + progress.completed) / (progress.total * 2)) * 100));
  fill.style.width = `${pct}%`;

  const stageLabel = progress.stage === "with_power" ? "with power" : "without power";
  text.textContent = `Running ${stageLabel}: ${progress.completed}/${progress.total}`;
});

let pastSimulationsLoaded = false;

async function loadPastSimulations(forceReload) {
  const container = document.getElementById("simPastRuns");
  if (!container) return;
  if (pastSimulationsLoaded && !forceReload) return;

  container.textContent = "Loading…";

  try {
    const { data, error } = await window.supabaseClient
      .from("power_simulations")
      .select("power_id, power_role, runs, ai_difficulty, avg_guesses_with_power, avg_guesses_without_power, delta, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    renderPastSimulations(data);
    pastSimulationsLoaded = true;
  } catch (err) {
    console.error("Failed to load past simulations:", err);
    container.textContent = "Failed to load past runs";
  }
}

function renderPastSimulations(rows) {
  const container = document.getElementById("simPastRuns");
  if (!container) return;

  if (!rows.length) {
    container.textContent = "No simulations run yet";
    return;
  }

  container.innerHTML = rows.map(r => {
    const meta = window.POWER_METADATA?.[r.power_id];
    const sign = r.delta > 0 ? "+" : "";
    return `
      <div class="sim-past-run-row">
        <span class="sim-past-run-power">${meta?.emoji || ""} ${meta?.label || r.power_id}</span>
        <span class="sim-past-run-meta">${r.power_role} · ${r.runs} runs · lvl ${r.ai_difficulty}</span>
        <span class="sim-past-run-delta">${sign}${Number(r.delta).toFixed(2)}</span>
        <span class="sim-past-run-date">${new Date(r.created_at).toLocaleDateString()}</span>
      </div>
    `;
  }).join("");
}

// ------------------------------------------------------------------
// Test All Powers: runs the same single-power benchmark for every
// power (or every power of one role) in sequence, saving each result
// to Supabase as it lands — same runPowerSimulation code path, just
// orchestrated server-side (see runAllPowerSimulations) so the shared
// no-power baseline for a role is computed once instead of once per
// power.
// ------------------------------------------------------------------

let simRoleFilter = "all";

function powerCountsByFilter() {
  return {
    all: DEV_SETTER_POWERS.length + DEV_GUESSER_POWERS.length,
    setter: DEV_SETTER_POWERS.length,
    guesser: DEV_GUESSER_POWERS.length
  };
}

function updateSimTestAllEstimate() {
  const estimateEl = document.getElementById("simTestAllEstimate");
  if (!estimateEl) return;

  const runsInput = document.getElementById("simRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  const counts = powerCountsByFilter();
  const roleBatches = { all: 2, setter: 1, guesser: 1 };
  // ~100ms/trial measured empirically (see runPowerSimulation.js) — a
  // rough estimate, not a promise; actual speed depends on the server's
  // current load from other players' live games.
  const totalTrials = runs * (roleBatches[simRoleFilter] + counts[simRoleFilter]);
  const estSeconds = totalTrials * 0.1;
  const label = estSeconds < 60
    ? `~${Math.round(estSeconds)}s`
    : `~${(estSeconds / 60).toFixed(1)} min`;

  estimateEl.textContent = `Tests ${counts[simRoleFilter]} power${counts[simRoleFilter] === 1 ? "" : "s"} (${simRoleFilter}) — ${label}`;
}

document.getElementById("simRunsInput")?.addEventListener("input", updateSimTestAllEstimate);

document.querySelectorAll("#simRoleFilter .sim-role-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#simRoleFilter .sim-role-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    simRoleFilter = btn.dataset.role;
    updateSimTestAllEstimate();
    renderCharts();
  });
});

document.getElementById("simSplitViewToggle")?.addEventListener("change", (e) => {
  const filterEl = document.getElementById("simRoleFilter");
  if (filterEl) filterEl.style.visibility = e.target.checked ? "hidden" : "visible";
  renderCharts();
});

document.getElementById("simTestAllBtn")?.addEventListener("click", () => {
  const userId = window.currentUser?.id;
  if (!userId) {
    window.toast?.("Log in first to run a simulation.");
    return;
  }

  const runsInput = document.getElementById("simRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  runsInput.value = runs;
  const aiDifficulty = parseInt(document.getElementById("simDifficultySelect")?.value, 10) || 2;

  const testAllBtn = document.getElementById("simTestAllBtn");
  const runBtn = document.getElementById("simRunBtn");
  const progress = document.getElementById("simBatchProgress");
  const progressFill = document.getElementById("simBatchProgressFill");
  const progressText = document.getElementById("simBatchProgressText");

  testAllBtn.disabled = true;
  runBtn.disabled = true;
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Starting…";

  socket.emit(
    "runAllPowerSimulations",
    { userId, runs, aiDifficulty, roleFilter: simRoleFilter },
    (res) => {
      testAllBtn.disabled = false;
      runBtn.disabled = false;
      progress.classList.add("hidden");

      if (!res?.ok) {
        window.toast?.(res?.error || "Batch simulation failed");
        return;
      }

      const failedSaves = res.results.filter(r => !r.saved).length;
      window.toast?.(
        failedSaves
          ? `Tested ${res.results.length} powers — ${failedSaves} failed to save, see console.`
          : `Tested ${res.results.length} powers.`
      );

      loadPastSimulations(true);
      loadChartData(true);
    }
  );
});

socket.on("powerSimulationBatchProgress", (p) => {
  const progress = document.getElementById("simBatchProgress");
  const fill = document.getElementById("simBatchProgressFill");
  const text = document.getElementById("simBatchProgressText");
  if (!progress || progress.classList.contains("hidden")) return;

  if (p.phase === "baseline") {
    text.textContent = `Computing ${p.role} baseline: ${p.completed}/${p.total}`;
    return;
  }

  if (p.phase === "power") {
    const pct = Math.min(100, Math.round(((p.powerIndex + p.completed / p.total) / p.totalPowers) * 100));
    fill.style.width = `${pct}%`;
    const meta = window.POWER_METADATA?.[p.powerId];
    text.textContent = `Testing ${meta?.emoji || ""} ${meta?.label || p.powerId} (${p.powerIndex + 1}/${p.totalPowers}): ${p.completed}/${p.total}`;
  }
});

// ------------------------------------------------------------------
// Chart: latest result per power, read straight from Supabase (same
// direct-read pattern as loadPastSimulations/statistics.js). Recent
// rows are deduped client-side down to one (the newest) per power_id +
// power_role, since a "latest per power" query isn't expressible with
// the JS client without a server-side view/RPC.
// ------------------------------------------------------------------

let chartRowsCache = null;

async function loadChartData(forceReload) {
  if (chartRowsCache && !forceReload) {
    renderCharts();
    return;
  }

  const wrap = document.getElementById("simChartWrap");
  if (wrap) wrap.innerHTML = `<div class="sim-chart-empty">Loading…</div>`;

  try {
    const { data, error } = await window.supabaseClient
      .from("power_simulations")
      .select("power_id, power_role, runs, ai_difficulty, avg_guesses_with_power, raw_with_power, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const latestByPower = new Map();
    for (const row of data) {
      const key = row.power_id + ":" + row.power_role;
      if (!latestByPower.has(key)) latestByPower.set(key, row);
    }
    chartRowsCache = [...latestByPower.values()];

    renderCharts();
  } catch (err) {
    console.error("Failed to load chart data:", err);
    if (wrap) wrap.innerHTML = `<div class="sim-chart-empty">Failed to load chart data</div>`;
  }
}

function computeStdErr(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return 0;
  const n = raw.length;
  const mean = raw.reduce((a, b) => a + b, 0) / n;
  const variance = raw.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) / Math.sqrt(n);
}

// Sorted ascending by average guesses, per the "sort by guess count" spec.
function buildChartDataset(rows, roleFilter) {
  return rows
    .filter(r => roleFilter === "all" || r.power_role === roleFilter)
    .map(r => {
      const meta = window.POWER_METADATA?.[r.power_id];
      const raw = Array.isArray(r.raw_with_power) ? r.raw_with_power : [];
      return {
        id: r.power_id,
        role: r.power_role,
        label: meta?.label || r.power_id,
        emoji: meta?.emoji || "",
        avg: Number(r.avg_guesses_with_power),
        sem: computeStdErr(raw),
        n: raw.length || r.runs || 0
      };
    })
    .sort((a, b) => a.avg - b.avg);
}

function renderCharts() {
  const wrap = document.getElementById("simChartWrap");
  if (!wrap || !chartRowsCache) return;

  if (!chartRowsCache.length) {
    wrap.innerHTML = `<div class="sim-chart-empty">No simulation results yet — run one above.</div>`;
    return;
  }

  const splitOn = document.getElementById("simSplitViewToggle")?.checked;

  if (splitOn) {
    wrap.innerHTML = `
      <div class="sim-chart-pair">
        <div class="sim-chart-single">
          <div class="sim-chart-title">Guesser Powers</div>
          <div class="sim-chart-svg-wrap" id="simChartGuesser"></div>
        </div>
        <div class="sim-chart-single">
          <div class="sim-chart-title">Setter Powers</div>
          <div class="sim-chart-svg-wrap" id="simChartSetter"></div>
        </div>
      </div>
    `;
    renderBarChart(document.getElementById("simChartGuesser"), buildChartDataset(chartRowsCache, "guesser"));
    renderBarChart(document.getElementById("simChartSetter"), buildChartDataset(chartRowsCache, "setter"));
  } else {
    wrap.innerHTML = `<div class="sim-chart-svg-wrap" id="simChartSingle"></div>`;
    renderBarChart(document.getElementById("simChartSingle"), buildChartDataset(chartRowsCache, simRoleFilter));
  }
}

// Hand-rolled SVG bar chart — power on the x axis, avg guesses (with the
// power active) on the y axis, error bars showing standard error of the
// mean. No charting library in this codebase yet, and a plain bar+error
// chart doesn't need one.
function renderBarChart(container, data) {
  if (!container) return;

  if (!data.length) {
    container.innerHTML = `<div class="sim-chart-empty">No data for this filter yet</div>`;
    return;
  }

  const barW = 28;
  const gap = 16;
  const marginTop = 14;
  const marginBottom = 40;
  const marginLeft = 30;
  const marginRight = 14;
  const plotH = 200;

  const width = marginLeft + marginRight + data.length * (barW + gap);
  const height = marginTop + plotH + marginBottom;

  const yMax = Math.max(...data.map(d => d.avg + d.sem), 1) * 1.15;
  const yScale = v => marginTop + plotH - (v / yMax) * plotH;

  const roleColor = role => (role === "setter" ? "var(--setter-color, #f87171)" : "var(--guesser-color, #60a5fa)");

  const gridlineCount = 4;
  let gridlines = "";
  for (let i = 0; i <= gridlineCount; i++) {
    const val = (yMax / gridlineCount) * i;
    const y = yScale(val);
    gridlines += `
      <line class="sim-bar-axis" x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}"></line>
      <text class="sim-bar-axis-label" x="${marginLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${val.toFixed(1)}</text>
    `;
  }

  let bars = "";
  data.forEach((d, i) => {
    const x = marginLeft + i * (barW + gap);
    const cx = x + barW / 2;
    const barTop = yScale(d.avg);
    const barBottom = yScale(0);
    const errTop = yScale(d.avg + d.sem);
    const errBottom = yScale(Math.max(0, d.avg - d.sem));

    bars += `
      <g class="sim-bar-group">
        <title>${d.emoji} ${d.label} (${d.role}) — avg ${d.avg.toFixed(2)} ± ${d.sem.toFixed(2)} guesses (n=${d.n})</title>
        <rect class="sim-bar-fill" x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${barW}" height="${Math.max(0, barBottom - barTop).toFixed(1)}" fill="${roleColor(d.role)}" rx="3"></rect>
        <line class="sim-bar-errbar" x1="${cx.toFixed(1)}" y1="${errTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${errBottom.toFixed(1)}"></line>
        <line class="sim-bar-errbar" x1="${(cx - 5).toFixed(1)}" y1="${errTop.toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${errTop.toFixed(1)}"></line>
        <line class="sim-bar-errbar" x1="${(cx - 5).toFixed(1)}" y1="${errBottom.toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${errBottom.toFixed(1)}"></line>
        <text class="sim-bar-x-label" x="${cx.toFixed(1)}" y="${(marginTop + plotH + 20).toFixed(1)}">${d.emoji}</text>
      </g>
    `;
  });

  container.innerHTML = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${gridlines}
      ${bars}
    </svg>
  `;
}
