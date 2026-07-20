// client/power-loadouts.js — "Power Loadouts" menu screen (build/save/
// delete up to 5 point-budgeted power combinations for custom mode) plus
// the lobby's power-mode selector (Draft/Random/Custom) and per-match
// loadout picker.
//
// Supabase CRUD follows the same direct-client pattern as client/friends.js
// (RLS-protected, owner_id = auth.uid()) against a `power_loadouts` table:
//   id (uuid pk), owner_id (uuid), name (text),
//   setter_powers (jsonb array of power ids), guesser_powers (jsonb array),
//   created_at (timestamptz default now())
//
// Costs/caps mirror server/powers/POWER_POINTS.js via
// powerEngine/POWER_POINTS.js (kept in sync manually, same convention as
// DEV_SETTER_POWERS/DEV_GUESSER_POWERS below).

(function () {
  const sb = () => window.supabaseClient;
  const MAX_SAVED_LOADOUTS = 5;

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ── Supabase helpers ──────────────────────────────────────────────────
  async function fetchLoadouts(userId) {
    const { data } = await sb()
      .from("power_loadouts")
      .select("id, name, setter_powers, guesser_powers, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    return data || [];
  }

  async function saveLoadout(userId, name, setterPowers, guesserPowers) {
    const { error } = await sb()
      .from("power_loadouts")
      .insert({
        owner_id: userId,
        name,
        setter_powers: setterPowers,
        guesser_powers: guesserPowers
      });
    return !error;
  }

  async function deleteLoadout(id) {
    const { error } = await sb().from("power_loadouts").delete().eq("id", id);
    return !error;
  }

  // ── Shared loadout cache (used by both the builder screen and the lobby
  // picker so we don't refetch on every single state broadcast) ─────────
  let _cachedLoadouts = null;

  async function ensureLoadoutsCached(force) {
    if (!window.currentUser) return [];
    if (force || !_cachedLoadouts) {
      _cachedLoadouts = await fetchLoadouts(window.currentUser.id);
    }
    return _cachedLoadouts;
  }

  function invalidateLoadoutsCache() {
    _cachedLoadouts = null;
    const pickerSelect = document.getElementById("loadoutPickerSelect");
    if (pickerSelect) pickerSelect.dataset.loaded = "0";
  }

  // ── Builder (checkbox lists with live cost/cap enforcement) ───────────
  function renderPowerColumn(containerId, powerIds, pointsMap, selected) {
    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = powerIds.map((id) => {
      const meta = window.POWER_METADATA?.[id];
      const cost = pointsMap[id];
      const checked = selected.includes(id);
      return `
        <label class="dev-power-checkbox loadout-power-checkbox">
          <input type="checkbox" value="${id}" ${checked ? "checked" : ""} />
          <span class="dev-power-checkbox-emoji">${meta?.emoji || ""}</span>
          <span class="dev-power-checkbox-label">${meta?.label || id}</span>
          <span class="loadout-power-cost">${cost}pt</span>
        </label>
      `;
    }).join("");
  }

  function refreshBuilder() {
    const setterList = document.getElementById("loadoutSetterList");
    const guesserList = document.getElementById("loadoutGuesserList");
    if (!setterList || !guesserList) return { setterChecked: [], guesserChecked: [], cost: 0 };

    const setterChecked = Array.from(setterList.querySelectorAll("input:checked")).map((cb) => cb.value);
    const guesserChecked = Array.from(guesserList.querySelectorAll("input:checked")).map((cb) => cb.value);
    const cost = window.loadoutCost([...setterChecked, ...guesserChecked]);

    const totalEl = document.getElementById("loadoutTotalDisplay");
    if (totalEl) {
      totalEl.textContent = `${cost} / ${window.MAX_LOADOUT_POINTS} pts`;
      totalEl.classList.toggle("loadout-total-over", cost > window.MAX_LOADOUT_POINTS);
    }

    setterList.querySelectorAll("input").forEach((cb) => {
      if (cb.checked) { cb.disabled = false; return; }
      const wouldCost = cost + (window.SETTER_POWER_POINTS[cb.value] || 0);
      cb.disabled = setterChecked.length >= window.MAX_POWERS_PER_ROLE || wouldCost > window.MAX_LOADOUT_POINTS;
    });
    guesserList.querySelectorAll("input").forEach((cb) => {
      if (cb.checked) { cb.disabled = false; return; }
      const wouldCost = cost + (window.GUESSER_POWER_POINTS[cb.value] || 0);
      cb.disabled = guesserChecked.length >= window.MAX_POWERS_PER_ROLE || wouldCost > window.MAX_LOADOUT_POINTS;
    });

    const hasAny = setterChecked.length > 0 || guesserChecked.length > 0;
    const valid = hasAny && window.isLoadoutValid(setterChecked, guesserChecked);
    const saveBtn = document.getElementById("loadoutSaveBtn");
    if (saveBtn) saveBtn.disabled = !valid;

    return { setterChecked, guesserChecked, cost };
  }

  function resetBuilder() {
    renderPowerColumn("loadoutSetterList", DEV_SETTER_POWERS, window.SETTER_POWER_POINTS, []);
    renderPowerColumn("loadoutGuesserList", DEV_GUESSER_POWERS, window.GUESSER_POWER_POINTS, []);
    refreshBuilder();
    const nameInput = document.getElementById("loadoutNameInput");
    if (nameInput) nameInput.value = "";
  }

  async function handleSave() {
    const name = document.getElementById("loadoutNameInput")?.value.trim();
    if (!name) return toast("Give your loadout a name");

    const existing = await ensureLoadoutsCached();
    if (existing.length >= MAX_SAVED_LOADOUTS) {
      return toast(`You already have ${MAX_SAVED_LOADOUTS} saved loadouts — delete one first`);
    }

    const { setterChecked, guesserChecked } = refreshBuilder();
    if (!window.isLoadoutValid(setterChecked, guesserChecked) || (!setterChecked.length && !guesserChecked.length)) {
      return toast("Loadout is invalid");
    }

    const ok = await saveLoadout(window.currentUser.id, name, setterChecked, guesserChecked);
    if (!ok) return toast("Could not save loadout");

    toast("Loadout saved!");
    resetBuilder();
    invalidateLoadoutsCache();
    await loadSavedList();
  }

  // ── Saved loadouts list ────────────────────────────────────────────────
  async function loadSavedList() {
    const wrap = document.getElementById("loadoutsListWrap");
    if (!wrap) return;
    const loadouts = await ensureLoadoutsCached(true);

    if (!loadouts.length) {
      wrap.innerHTML = `<p class="friends-empty">No saved loadouts yet (0/${MAX_SAVED_LOADOUTS}). Build one below.</p>`;
      return;
    }

    wrap.innerHTML = `<p class="friends-section-label">Saved (${loadouts.length}/${MAX_SAVED_LOADOUTS})</p>` +
      loadouts.map((lo) => {
        const cost = window.loadoutCost([...(lo.setter_powers || []), ...(lo.guesser_powers || [])]);
        return `
          <div class="friends-row loadout-row">
            <span class="friends-name">${esc(lo.name)} <small>(${cost}pt)</small></span>
            <button class="secondary-btn small" data-delete-loadout="${lo.id}">Delete</button>
          </div>`;
      }).join("");

    wrap.querySelectorAll("[data-delete-loadout]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteLoadout(btn.dataset.deleteLoadout);
        invalidateLoadoutsCache();
        await loadSavedList();
        window.updatePowerModeUI?.();
      });
    });
  }

  // ── Entry point ──────────────────────────────────────────────────────
  window.showPowerLoadoutsScreen = async function () {
    if (!window.currentUser) return toast("Please log in first");
    showScreen("powerLoadoutsScreen");

    const screen = document.getElementById("powerLoadoutsScreen");
    if (!screen) return;

    screen.innerHTML = `
      <div class="menu-center friends-center">
        <div class="friends-header">
          <button class="menu-btn friends-back" id="loadoutsBackBtn">← Back</button>
          <h2 class="menu-title" style="flex:1;text-align:center">Power Loadouts</h2>
        </div>
        <div id="loadoutsListWrap" class="friends-content"><p class="friends-empty">Loading…</p></div>

        <div class="loadout-builder">
          <h3 class="loadout-builder-title">New Loadout</h3>
          <input id="loadoutNameInput" class="menu-input" placeholder="Loadout name" maxlength="40" autocomplete="off" />
          <div class="dev-powers-columns">
            <div class="dev-powers-col">
              <div class="dev-powers-col-label role-setter">Spy (max 3)</div>
              <div class="dev-powers-list" id="loadoutSetterList"></div>
            </div>
            <div class="dev-powers-col">
              <div class="dev-powers-col-label role-guesser">Inspector (max 3)</div>
              <div class="dev-powers-list" id="loadoutGuesserList"></div>
            </div>
          </div>
          <div class="loadout-total" id="loadoutTotalDisplay">0 / ${window.MAX_LOADOUT_POINTS} pts</div>
          <button id="loadoutSaveBtn" class="primary-btn small" disabled>Save Loadout</button>
        </div>
      </div>
    `;

    document.getElementById("loadoutsBackBtn")?.addEventListener("click", () => {
      if (window.roomId && window.state?.phase === "lobby") {
        showScreen("lobby");
      } else {
        showStartup();
      }
    });

    resetBuilder();
    document.getElementById("loadoutSetterList")?.addEventListener("change", refreshBuilder);
    document.getElementById("loadoutGuesserList")?.addEventListener("change", refreshBuilder);
    document.getElementById("loadoutSaveBtn")?.addEventListener("click", handleSave);

    await loadSavedList();
  };

  document.getElementById("powerLoadoutsBtn")?.addEventListener("click", () => {
    window.showPowerLoadoutsScreen?.();
  });

  // ── Lobby wiring: power-mode selector + per-match loadout picker ──────
  document.getElementById("powerModeSelect")?.addEventListener("change", (e) => {
    if (!window.currentUser || !window.state) return;
    sendGameAction({ type: "SET_POWER_MODE", mode: e.target.value, userId: window.currentUser.id });
  });

  document.getElementById("loadoutPickerSelect")?.addEventListener("change", async (e) => {
    if (!window.currentUser) return;
    const id = e.target.value;
    if (!id) return; // "Random loadout" -- no explicit pick, server falls back to a random valid one
    const loadouts = await ensureLoadoutsCached();
    const lo = loadouts.find((l) => l.id === id);
    if (!lo) return;
    sendGameAction({
      type: "SET_CUSTOM_LOADOUT",
      userId: window.currentUser.id,
      setterPowers: lo.setter_powers || [],
      guesserPowers: lo.guesser_powers || []
    });
  });

  document.getElementById("manageLoadoutsBtn")?.addEventListener("click", () => {
    window.showPowerLoadoutsScreen?.();
  });

  window.updatePowerModeUI = async function () {
    const select = document.getElementById("powerModeSelect");
    const picker = document.getElementById("customLoadoutPicker");
    if (!select || !window.state || !window.currentUser) return;

    const mode = window.state.customPowersMode ? "custom" : (window.state.draftMode ? "draft" : "random");
    if (document.activeElement !== select && select.value !== mode) select.value = mode;

    const isHost = window.state.hostUserId === window.currentUser.id;
    select.disabled = !isHost;

    const showPicker = mode === "custom" && window.state.phase === "lobby";
    picker?.classList.toggle("hidden", !showPicker);
    if (!showPicker) return;

    const loadouts = await ensureLoadoutsCached();
    const pickerSelect = document.getElementById("loadoutPickerSelect");
    if (!pickerSelect) return;

    if (pickerSelect.dataset.loaded !== "1") {
      pickerSelect.innerHTML = `<option value="">Random loadout</option>` +
        loadouts.map((lo) => {
          const cost = window.loadoutCost([...(lo.setter_powers || []), ...(lo.guesser_powers || [])]);
          return `<option value="${lo.id}">${esc(lo.name)} (${cost}pt)</option>`;
        }).join("");
      pickerSelect.dataset.loaded = "1";
    }

    const mine = window.state._customPlayerLoadouts?.[window.currentUser.id];
    if (mine && document.activeElement !== pickerSelect) {
      const sortedA = (arr) => (arr || []).slice().sort().join(",");
      const match = loadouts.find((lo) =>
        sortedA(lo.setter_powers) === sortedA(mine.setterPowers) &&
        sortedA(lo.guesser_powers) === sortedA(mine.guesserPowers)
      );
      pickerSelect.value = match ? match.id : "";
    }
  };
})();
