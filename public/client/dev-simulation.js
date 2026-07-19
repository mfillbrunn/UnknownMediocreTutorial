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
