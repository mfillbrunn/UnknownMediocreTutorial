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
  // Always force a fresh fetch on open — someone else's simulation run
  // (another tab, another session) may have landed in Supabase since this
  // page loaded, and the cached rows from a prior visit would silently
  // hide that instead of showing the latest data.
  loadPastSimulations(true);
  loadChartData(true);
  updateSimTestAllEstimate();
  loadPastQuestSimulations(true);
  loadQuestChartData(true);
  updateSimQuestTestAllEstimate();
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
    ? `Held by the ${role === "setter" ? "Secretkeeper (setter)" : "Guesser (guesser)"} for the whole run`
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

document.getElementById("simRunsInput")?.addEventListener("input", () => {
  updateSimTestAllEstimate();
  updateSimQuestTestAllEstimate();
});

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
      .select("power_id, power_role, runs, ai_difficulty, avg_guesses_with_power, avg_guesses_without_power, raw_with_power, raw_without_power, created_at")
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
    console.error("Failed to load table data:", err);
    if (wrap) wrap.innerHTML = `<div class="sim-chart-empty">Failed to load table data</div>`;
  }
}

function computeStdErr(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return 0;
  const n = raw.length;
  const mean = raw.reduce((a, b) => a + b, 0) / n;
  const variance = raw.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) / Math.sqrt(n);
}

// The chart's y-value: how much the power moved guesses away from the
// no-power baseline, on a scale where POSITIVE always means "the power is
// working as intended for whoever holds it" regardless of role. A setter
// power that hides info should make the guesser take MORE guesses (raw
// delta is already positive, no flip needed). A guesser power that reveals
// info should make the guesser take FEWER guesses (raw delta is negative),
// so it's negated here — otherwise a genuinely strong guesser power would
// plot as a big negative bar right next to a genuinely strong setter
// power's big positive bar, even though both are "strong" in the same
// sense. sem combines both batches' standard errors (independent samples),
// since the plotted value is now a difference of two means, not one.
function computeEffectiveness(row) {
  const avgWith = Number(row.avg_guesses_with_power);
  const avgWithout = Number(row.avg_guesses_without_power);
  const rawDelta = avgWith - avgWithout;
  const value = row.power_role === "guesser" ? -rawDelta : rawDelta;

  const semWith = computeStdErr(row.raw_with_power);
  const semWithout = computeStdErr(row.raw_without_power);
  const sem = Math.sqrt(semWith ** 2 + semWithout ** 2);

  return { value, sem };
}

// Plain (unflipped) average guesses across the no-power baseline trials,
// to contextualize the effectiveness scale above — e.g. "+0.4" only means
// something once you know a typical round takes ~4-5 guesses to begin
// with. Averaged per-row rather than per-trial: each row already IS an
// average over its own baseline batch (shared across every power of that
// role for a "Test All" run, or dedicated for a standalone single-power
// run), so this is an average of averages, not a mix of different sample
// sizes double-counting the shared "Test All" baseline.
function computeBaselineAvg(rows, role) {
  const filtered = rows.filter(r => role === "all" || r.power_role === role);
  if (!filtered.length) return null;
  return filtered.reduce((s, r) => s + Number(r.avg_guesses_without_power), 0) / filtered.length;
}

// Sorted ascending by effectiveness, per the "sort by guess count" spec —
// weakest (or backfiring) powers first, strongest last.
function buildChartDataset(rows, roleFilter) {
  return rows
    .filter(row => roleFilter === "all" || row.power_role === roleFilter)
    .map(row => {
      const meta = window.POWER_METADATA?.[row.power_id];
      const { value, sem } = computeEffectiveness(row);
      const raw = Array.isArray(row.raw_with_power) ? row.raw_with_power : [];
      return {
        id: row.power_id,
        role: row.power_role,
        label: meta?.label || row.power_id,
        emoji: meta?.emoji || "",
        value,
        sem,
        avgWith: Number(row.avg_guesses_with_power),
        avgWithout: Number(row.avg_guesses_without_power),
        n: raw.length || row.runs || 0,
        aiDifficulty: row.ai_difficulty ?? row.aiDifficulty ?? "—"
      };
    })
    .sort((a, b) => b.value - a.value);
}

// SIMULATION_TABLE_PATCH v1
function simTableEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function simEffectCell(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `<span class="sim-effect-pill is-neutral">—</span>`;
  const tone = number > .005 ? "is-positive" : number < -.005 ? "is-negative" : "is-neutral";
  const sign = number > 0 ? "+" : "";
  return `<span class="sim-effect-pill ${tone}">${sign}${number.toFixed(2)}</span>`;
}
function renderSimulationTable(container, { title = "", note = "", columns = [], rows = [] } = {}) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="sim-table-empty">No data for this filter yet.</div>`;
    return;
  }
  const head = columns.map((column) => `<th class="${column.numeric ? "is-number" : ""}">${simTableEscape(column.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((column) => {
    const rendered = typeof column.render === "function" ? column.render(row) : simTableEscape(row[column.key]);
    const className = [column.numeric ? "is-number" : "", column.name ? "is-name" : ""].filter(Boolean).join(" ");
    return `<td class="${className}">${rendered ?? "—"}</td>`;
  }).join("")}</tr>`).join("");
  container.innerHTML = `<section class="sim-table-shell">
    <header class="sim-table-head">
      ${title ? `<h4 class="sim-table-title">${simTableEscape(title)}</h4>` : ""}
      ${note ? `<div class="sim-table-note">${simTableEscape(note)}</div>` : ""}
    </header>
    <div class="sim-table-scroll"><table class="sim-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
  </section>`;
}
window.renderSimulationTable = renderSimulationTable;

function renderCharts() {
  const wrap = document.getElementById("simChartWrap");
  if (!wrap || !chartRowsCache) return;
  if (!chartRowsCache.length) {
    wrap.innerHTML = `<div class="sim-table-empty">No simulation results yet — run one above.</div>`;
    return;
  }
  const columns = (includeRole) => [
    { label: "Power", name: true, render: row => `${simTableEscape(row.emoji)} ${simTableEscape(row.label)}` },
    ...(includeRole ? [{ label: "Role", render: row => row.role === "setter" ? "Secretkeeper" : "Guesser" }] : []),
    { label: "With", numeric: true, render: row => Number.isFinite(row.avgWith) ? row.avgWith.toFixed(2) : "—" },
    { label: "Baseline", numeric: true, render: row => Number.isFinite(row.avgWithout) ? row.avgWithout.toFixed(2) : "—" },
    { label: "Effect", numeric: true, render: row => simEffectCell(row.value) },
    { label: "±", numeric: true, render: row => Number(row.sem || 0).toFixed(2) },
    { label: "Trials", numeric: true, key: "n" },
    { label: "AI", numeric: true, key: "aiDifficulty" }
  ];
  const splitOn = document.getElementById("simSplitViewToggle")?.checked;
  if (splitOn) {
    wrap.innerHTML = `<div class="sim-table-pair"><div id="simTableGuesser"></div><div id="simTableSetter"></div></div>`;
    renderSimulationTable(document.getElementById("simTableGuesser"), {
      title: "Guesser powers",
      note: "Positive effect means the Guesser needed fewer guesses.",
      columns: columns(false),
      rows: buildChartDataset(chartRowsCache, "guesser")
    });
    renderSimulationTable(document.getElementById("simTableSetter"), {
      title: "Secretkeeper powers",
      note: "Positive effect means the Secretkeeper forced more guesses.",
      columns: columns(false),
      rows: buildChartDataset(chartRowsCache, "setter")
    });
    return;
  }
  renderSimulationTable(wrap, {
    title: "Power strength",
    note: "Effect is normalized so positive always helps the role that owns the power.",
    columns: columns(simRoleFilter === "all"),
    rows: buildChartDataset(chartRowsCache, simRoleFilter)
  });
}

// Hand-rolled SVG bar chart — power (or quest, see renderQuestChart below)
// on the x axis, some measured value on the y axis, error bars showing
// standard error. No charting library in this codebase yet, and a plain
// bar+error chart doesn't need one.
//
// opts lets a caller other than the default power-effectiveness chart
// reuse the same renderer without forking it:
//   - colorFor(d): bar fill color, defaults to the setter/guesser role color
//   - tooltipFor(d): <title> hover text, defaults to the effectiveness wording
//   - zeroBased: plot [0, max] instead of the default zero-centered
//     [-max, max] -- power effectiveness can legitimately go negative
//     (a power backfiring), but a completion rate or count never can, so
//     centering it on zero would waste the whole lower half of the chart.
function renderBarChart(container, data, opts = {}) {
  if (!container) return;

  if (!data.length) {
    container.innerHTML = `<div class="sim-chart-empty">No data for this filter yet</div>`;
    return;
  }

  const barW = 28;
  const gap = 22;
  const marginTop = 14;
  const marginBottom = 68;
  const marginLeft = 34;
  const marginRight = 14;
  const plotH = 200;

  const width = marginLeft + marginRight + data.length * (barW + gap);
  const height = marginTop + plotH + marginBottom;

  const zeroBased = !!opts.zeroBased;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.value) + d.sem), 0.5) * 1.15;
  const yMin = zeroBased ? 0 : -maxAbs;
  const yMax = zeroBased ? Math.max(...data.map(d => d.value + d.sem), 1) * 1.15 : maxAbs;
  const yScale = v => marginTop + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const zeroY = yScale(0);

  const roleColor = role => (role === "setter" ? "var(--setter-color, #f87171)" : "var(--guesser-color, #60a5fa)");
  const colorFor = opts.colorFor || (d => roleColor(d.role));
  const tooltipFor = opts.tooltipFor || (d => {
    const sign = d.value >= 0 ? "+" : "";
    return `${d.emoji} ${d.label} (${d.role}) — effectiveness ${sign}${d.value.toFixed(2)} ± ${d.sem.toFixed(2)} guesses (n=${d.n})`;
  });

  const gridVals = zeroBased
    ? [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax]
    : [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  const gridlines = gridVals.map(val => {
    const y = yScale(val);
    const zero = val === 0;
    return `
      <line class="${zero ? "sim-bar-zero-line" : "sim-bar-axis"}" x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}"></line>
      <text class="sim-bar-axis-label" x="${marginLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${val.toFixed(1)}</text>
    `;
  }).join("");

  let bars = "";
  data.forEach((d, i) => {
    const x = marginLeft + i * (barW + gap);
    const cx = x + barW / 2;
    const barEdge = yScale(d.value);
    const barTop = Math.min(barEdge, zeroY);
    const barH = Math.abs(zeroY - barEdge);
    const errTop = yScale(d.value + d.sem);
    const errBottom = yScale(d.value - d.sem);

    bars += `
      <g class="sim-bar-group">
        <title>${tooltipFor(d)}</title>
        <rect class="sim-bar-fill" x="${x.toFixed(1)}" y="${barTop.toFixed(1)}" width="${barW}" height="${Math.max(0, barH).toFixed(1)}" fill="${colorFor(d)}" rx="3"></rect>
        <line class="sim-bar-errbar" x1="${cx.toFixed(1)}" y1="${errTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${errBottom.toFixed(1)}"></line>
        <line class="sim-bar-errbar" x1="${(cx - 5).toFixed(1)}" y1="${errTop.toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${errTop.toFixed(1)}"></line>
        <line class="sim-bar-errbar" x1="${(cx - 5).toFixed(1)}" y1="${errBottom.toFixed(1)}" x2="${(cx + 5).toFixed(1)}" y2="${errBottom.toFixed(1)}"></line>
        <text class="sim-bar-x-label" x="${cx.toFixed(1)}" y="${(marginTop + plotH + 14).toFixed(1)}" transform="rotate(-40 ${cx.toFixed(1)} ${(marginTop + plotH + 14).toFixed(1)})">${d.id}</text>
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

// ------------------------------------------------------------------
// Quest Completion Chart: forces each guesser quest type onto an AI
// guesser (see server/core/simulation/runQuestSimulation.js) across many
// single-round trials with no other powers active, and measures how often
// the quest is actually completed for its full green reward before the
// round ends. Unlike powers there's no with/without baseline to diff
// against -- every guesser always has exactly one quest -- so the chart's
// y-axis is a completion rate (0-100%) per type instead of an
// effectiveness delta.
// ------------------------------------------------------------------

function questCountsTotal() {
  return window.QUEST_METADATA ? Object.keys(window.QUEST_METADATA).length : 12;
}

function updateSimQuestTestAllEstimate() {
  const estimateEl = document.getElementById("simQuestTestAllEstimate");
  if (!estimateEl) return;

  const runsInput = document.getElementById("simRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  const total = questCountsTotal();
  // Same rough ~100ms/trial estimate as updateSimTestAllEstimate, no shared
  // baseline batch here since every quest type's trials are independent.
  const estSeconds = runs * total * 0.1;
  const label = estSeconds < 60
    ? `~${Math.round(estSeconds)}s`
    : `~${(estSeconds / 60).toFixed(1)} min`;

  estimateEl.textContent = `Tests ${total} quests — ${label}`;
}

document.getElementById("simQuestTestAllBtn")?.addEventListener("click", () => {
  const userId = window.currentUser?.id;
  if (!userId) {
    window.toast?.("Log in first to run a simulation.");
    return;
  }

  const runsInput = document.getElementById("simRunsInput");
  const runs = Math.max(1, Math.min(1000, parseInt(runsInput?.value, 10) || 100));
  runsInput.value = runs;
  const aiDifficulty = parseInt(document.getElementById("simDifficultySelect")?.value, 10) || 2;

  const testAllBtn = document.getElementById("simQuestTestAllBtn");
  const progress = document.getElementById("simQuestBatchProgress");
  const progressFill = document.getElementById("simQuestBatchProgressFill");
  const progressText = document.getElementById("simQuestBatchProgressText");

  testAllBtn.disabled = true;
  progress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Starting…";

  socket.emit(
    "runAllQuestSimulations",
    { userId, runs, aiDifficulty },
    (res) => {
      testAllBtn.disabled = false;
      progress.classList.add("hidden");

      if (!res?.ok) {
        window.toast?.(res?.error || "Batch simulation failed");
        return;
      }

      const failedSaves = res.results.filter(r => !r.saved).length;
      window.toast?.(
        failedSaves
          ? `Tested ${res.results.length} quests — ${failedSaves} failed to save, see console.`
          : `Tested ${res.results.length} quests.`
      );

      loadPastQuestSimulations(true);
      loadQuestChartData(true);
    }
  );
});

socket.on("questSimulationBatchProgress", (p) => {
  const progress = document.getElementById("simQuestBatchProgress");
  const fill = document.getElementById("simQuestBatchProgressFill");
  const text = document.getElementById("simQuestBatchProgressText");
  if (!progress || progress.classList.contains("hidden")) return;

  const pct = Math.min(100, Math.round(((p.questIndex + p.completed / p.total) / p.totalQuests) * 100));
  fill.style.width = `${pct}%`;
  const label = window.QUEST_METADATA?.[p.questType]?.label || p.questType;
  text.textContent = `Testing ${label} (${p.questIndex + 1}/${p.totalQuests}): ${p.completed}/${p.total}`;
});

let questPastSimulationsLoaded = false;

async function loadPastQuestSimulations(forceReload) {
  const container = document.getElementById("simQuestPastRuns");
  if (!container) return;
  if (questPastSimulationsLoaded && !forceReload) return;

  container.textContent = "Loading…";

  try {
    const { data, error } = await window.supabaseClient
      .from("quest_simulations")
      .select("quest_type, runs, ai_difficulty, completed_trials, completed, claimed_early, never_completed, completion_rate, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    renderPastQuestSimulations(data);
    questPastSimulationsLoaded = true;
  } catch (err) {
    console.error("Failed to load past quest simulations:", err);
    container.textContent = "Failed to load past runs";
  }
}

function renderPastQuestSimulations(rows) {
  const container = document.getElementById("simQuestPastRuns");
  if (!container) return;

  if (!rows.length) {
    container.textContent = "No quest simulations run yet";
    return;
  }

  container.innerHTML = rows.map(r => {
    const meta = window.QUEST_METADATA?.[r.quest_type];
    const pct = r.completion_rate == null ? "—" : `${(Number(r.completion_rate) * 100).toFixed(0)}%`;
    return `
      <div class="sim-past-run-row">
        <span class="sim-past-run-power">${meta?.emoji || ""} ${meta?.label || r.quest_type}</span>
        <span class="sim-past-run-meta">${r.runs} runs · lvl ${r.ai_difficulty} · n=${r.completed_trials}</span>
        <span class="sim-past-run-delta">${pct}</span>
        <span class="sim-past-run-date">${new Date(r.created_at).toLocaleDateString()}</span>
      </div>
    `;
  }).join("");
}

let questChartRowsCache = null;

async function loadQuestChartData(forceReload) {
  if (questChartRowsCache && !forceReload) {
    renderQuestChart();
    return;
  }

  const wrap = document.getElementById("simQuestChartWrap");
  if (wrap) wrap.innerHTML = `<div class="sim-chart-empty">Loading…</div>`;

  try {
    const { data, error } = await window.supabaseClient
      .from("quest_simulations")
      .select("quest_type, runs, ai_difficulty, completed_trials, completed, completion_rate, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const latestByQuest = new Map();
    for (const row of data) {
      if (!latestByQuest.has(row.quest_type)) latestByQuest.set(row.quest_type, row);
    }
    questChartRowsCache = [...latestByQuest.values()];

    renderQuestChart();
  } catch (err) {
    console.error("Failed to load quest chart data:", err);
    if (wrap) wrap.innerHTML = `<div class="sim-chart-empty">Failed to load table data</div>`;
  }
}

// Standard error of a Bernoulli proportion (completion rate), as a
// percentage to match the chart's 0-100 y-axis.
function completionRateSem(rate, n) {
  if (!n || rate == null) return 0;
  return Math.sqrt((rate * (1 - rate)) / n) * 100;
}

function buildQuestChartDataset(rows) {
  return rows
    .map(row => {
      const meta = window.QUEST_METADATA?.[row.quest_type];
      const rate = row.completion_rate == null ? 0 : Number(row.completion_rate);
      return {
        id: row.quest_type,
        label: meta?.label || row.quest_type,
        emoji: meta?.emoji || "",
        value: rate * 100,
        completed: row.completed ?? Math.round(rate * Number(row.completed_trials || row.runs || 0)),
        n: row.completed_trials || row.runs || 0,
        aiDifficulty: row.ai_difficulty ?? "—"
      };
    })
    .sort((a, b) => b.value - a.value);
}

function renderQuestChart() {
  const wrap = document.getElementById("simQuestChartWrap");
  if (!wrap || !questChartRowsCache) return;
  if (!questChartRowsCache.length) {
    wrap.innerHTML = `<div class="sim-table-empty">No quest simulation results yet — run one above.</div>`;
    return;
  }
  renderSimulationTable(wrap, {
    title: "Quest completion",
    note: "Higher completion means the AI can meet the quest more often.",
    columns: [
      { label: "Quest", name: true, render: row => `${simTableEscape(row.emoji)} ${simTableEscape(row.label)}` },
      { label: "Completion", numeric: true, render: row => `${row.value.toFixed(1)}%` },
      { label: "Completed", numeric: true, key: "completed" },
      { label: "Trials", numeric: true, key: "n" },
      { label: "AI", numeric: true, key: "aiDifficulty" }
    ],
    rows: buildQuestChartDataset(questChartRowsCache)
  });
}
