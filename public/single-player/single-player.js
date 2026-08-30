// public/single-player/single-player.js
// UMT_CAMPAIGN_FLOW_FIX_V1
// Coordinates campaign loading, narration, and the explicit server-authoritative
// transition into gameplay. The ordinary setter/guesser renderer still owns all
// playable state; this module never fabricates a local game state.
(function () {
  "use strict";

  async function getAccessToken() {
    try {
      const { data } = await window.supabaseClient.auth.getSession();
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  function spEmit(event, payload) {
    return new Promise(resolve => {
      getAccessToken().then(accessToken => {
        if (!accessToken) {
          resolve({ ok: false, code: "UNAUTHENTICATED", error: "Sign in to play the campaign." });
          return;
        }
        socket.timeout(8000).emit(event, { ...(payload || {}), accessToken }, (err, result) => {
          if (err) {
            resolve({ ok: false, code: "TIMEOUT", error: "The campaign server did not respond." });
            return;
          }
          resolve(result || { ok: false, code: "NO_RESPONSE", error: "The campaign server returned no result." });
        });
      });
    });
  }

  const VIEWS = ["spMapView", "spStoryView", "spResultView", "spAchievementsView"];
  let refreshPromise = null;
  let startStagePromise = null;
  let beginGameplayPromise = null;
  let finalizePromise = null;
  let prefetchScheduled = false;

  function showView(id) {
    VIEWS.forEach(viewId => {
      const el = document.getElementById(viewId);
      if (el) el.classList.toggle("hidden", viewId !== id);
    });
  }

  function enterGameScreen() {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.remove("active"));
    document.body.classList.remove("menu-mode");
  }

  function joinRoom(roomId) {
    if (typeof persistRoom === "function") persistRoom(roomId);
    window.roomId = roomId;
    if (typeof markFreshGameState === "function") markFreshGameState();
  }

  function hasStoryBeats(story) {
    return Array.isArray(story?.frames) && story.frames.some(frame =>
      Array.isArray(frame?.beats) && frame.beats.some(beat =>
        beat && typeof beat === "object" && (
          String(beat.text || "").trim() ||
          String(beat.speaker || "").trim() ||
          (Array.isArray(beat.choices) && beat.choices.length)
        )
      )
    );
  }

  function mapElement() {
    return document.getElementById("spMapNodes");
  }

  function setMapRefreshing(refreshing, preserveContent = true) {
    const mapEl = mapElement();
    if (!mapEl) return;
    mapEl.classList.toggle("is-refreshing", refreshing && preserveContent);
    mapEl.setAttribute("aria-busy", String(refreshing));
  }

  function showMapMessage(message, className) {
    const mapEl = mapElement();
    if (!mapEl) return;
    mapEl.innerHTML = "";
    const el = document.createElement("div");
    el.className = className;
    el.textContent = message;
    mapEl.appendChild(el);
  }

  function showMapWarning(message) {
    const mapEl = mapElement();
    if (!mapEl) return;
    mapEl.querySelector(".sp-map-refresh-warning")?.remove();
    const warning = document.createElement("div");
    warning.className = "sp-map-refresh-warning";
    warning.setAttribute("role", "status");
    warning.textContent = message;
    mapEl.appendChild(warning);
  }

  function renderManifest(manifest) {
    if (!manifest) return;
    window.SinglePlayerCampaignMap?.render(manifest);
  }

  function refreshCampaign() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const result = await spEmit("singlePlayer:getCampaign", {});
      if (result.ok) SP.manifest = result;
      return result;
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function openCampaignScreen() {
    window.showScreen("singlePlayerScreen");
    showView("spMapView");

    const hasCache = !!SP.manifest;
    if (hasCache) {
      renderManifest(SP.manifest);
    } else {
      showMapMessage("Loading campaign...", "sp-map-loading sp-map-loading-skeleton");
    }

    setMapRefreshing(true, hasCache);
    const result = await refreshCampaign();
    setMapRefreshing(false, hasCache);

    if (result.ok) {
      renderManifest(result);
      return result;
    }

    if (hasCache) {
      showMapWarning(result.error || "Showing saved campaign data; refresh failed.");
    } else {
      showMapMessage(result.error || "Campaign unavailable right now.", "sp-map-error");
    }
    return result;
  }

  function startStage(stageId) {
    if (startStagePromise) return startStagePromise;

    window.SinglePlayerCampaignMap?.setStartingStage(stageId);
    startStagePromise = (async () => {
      const result = await spEmit("singlePlayer:startStage", {
        stageId,
        userName: window.myProfile?.username || window.currentUser?.email || null
      });

      if (!result.ok) {
        if (typeof toast === "function") toast(result.error || "Could not start this stage.");
        return result;
      }

      SP.activeStage = result.stage;
      SP.activeRoomId = result.roomId;

      if (hasStoryBeats(result.stage?.preStory) && window.SinglePlayerStoryPlayer?.playPreStory) {
        window.SinglePlayerStoryPlayer.playPreStory(result.stage, result.roomId);
        return result;
      }

      return enterGameForActiveStage();
    })().catch(error => {
      const result = { ok: false, code: "CAMPAIGN_CLIENT_ERROR", error: error?.message || "Could not open this mission." };
      if (typeof toast === "function") toast(result.error);
      return result;
    }).finally(() => {
      window.SinglePlayerCampaignMap?.setStartingStage(null);
      startStagePromise = null;
    });

    return startStagePromise;
  }

  function restoreCampaignAfterBeginFailure(showStory) {
    window.showScreen("singlePlayerScreen");
    showView(showStory ? "spStoryView" : "spMapView");
  }

  function enterGameForActiveStage() {
    if (beginGameplayPromise) return beginGameplayPromise;

    let shouldRestoreStory = false;
    let previousRoomId = window.roomId || null;
    beginGameplayPromise = (async () => {
      const roomId = SP.activeRoomId;
      if (!roomId) {
        return { ok: false, code: "NO_ACTIVE_ROOM", error: "No campaign room is ready." };
      }

      const storyView = document.getElementById("spStoryView");
      shouldRestoreStory = !!storyView && !storyView.classList.contains("hidden");
      previousRoomId = window.roomId || null;

      // Prepare the normal game shell before the server emits authoritative
      // state. startStage itself deliberately emits no playable state.
      joinRoom(roomId);
      enterGameScreen();

      const result = await spEmit("singlePlayer:beginGameplay", { roomId });
      if (!result.ok) {
        window.roomId = previousRoomId;
        restoreCampaignAfterBeginFailure(shouldRestoreStory);
        if (typeof toast === "function") toast(result.error || "Could not start the mission. Try again.");
      }
      return result;
    })().catch(error => {
      window.roomId = previousRoomId;
      restoreCampaignAfterBeginFailure(shouldRestoreStory);
      const result = { ok: false, code: "CAMPAIGN_CLIENT_ERROR", error: error?.message || "Could not start the mission." };
      if (typeof toast === "function") toast(result.error);
      return result;
    }).finally(() => {
      beginGameplayPromise = null;
    });

    return beginGameplayPromise;
  }

  function advanceAfterResult() {
    const stage = SP.activeStage;
    if (hasStoryBeats(stage?.postStory) && window.SinglePlayerStoryPlayer?.playPostStory) {
      return window.SinglePlayerStoryPlayer.playPostStory(stage, SP.activeRoomId);
    }
    return finalizeStageAttempt();
  }

  function finalizeStageAttempt() {
    if (finalizePromise) return finalizePromise;
    const roomId = SP.activeRoomId;
    if (!roomId) return Promise.resolve({ ok: false, code: "NO_ACTIVE_ROOM" });

    finalizePromise = (async () => {
      const result = await spEmit("singlePlayer:completeStage", { roomId });
      if (!result.ok) {
        if (typeof toast === "function") toast(result.error || "Could not finish this stage. Try again.");
        return result;
      }
      SP.activeStage = null;
      SP.activeRoomId = null;
      await returnToMap();
      return result;
    })().finally(() => {
      finalizePromise = null;
    });

    return finalizePromise;
  }

  async function returnToMap() {
    window.showScreen("singlePlayerScreen");
    showView("spMapView");
    if (SP.manifest) renderManifest(SP.manifest);

    const hasCache = !!SP.manifest;
    if (!hasCache) showMapMessage("Loading campaign...", "sp-map-loading sp-map-loading-skeleton");
    setMapRefreshing(true, hasCache);
    const result = await refreshCampaign();
    setMapRefreshing(false, hasCache);

    if (result.ok) renderManifest(result);
    else if (hasCache) showMapWarning(result.error || "Campaign refresh failed.");
    else showMapMessage(result.error || "Campaign unavailable right now.", "sp-map-error");
    return result;
  }

  async function prefetchCampaign() {
    if (SP.manifest || refreshPromise) return;
    const token = await getAccessToken();
    if (!token || SP.manifest || refreshPromise) return;
    await refreshCampaign();
  }

  function scheduleCampaignPrefetch() {
    if (prefetchScheduled) return;
    prefetchScheduled = true;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => prefetchCampaign(), { timeout: 1500 });
    } else {
      window.setTimeout(() => prefetchCampaign(), 500);
    }
  }

  const SP = {
    manifest: null,
    activeStage: null,
    activeRoomId: null,
    emit: spEmit,
    showView,
    enterGameScreen,
    joinRoom,
    openCampaignScreen,
    startStage,
    enterGameForActiveStage,
    advanceAfterResult,
    finalizeStageAttempt,
    refreshCampaign,
    returnToMap
  };

  window.SinglePlayerCampaign = SP;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("singlePlayerBtn")?.addEventListener("click", openCampaignScreen);
    document.getElementById("spBackBtn")?.addEventListener("click", () => window.showStartup());
    document.getElementById("spAchievementsBtn")?.addEventListener("click", () => {
      showView("spAchievementsView");
      window.SinglePlayerAchievements?.render(SP.manifest);
    });
    document.getElementById("spAchievementsBackBtn")?.addEventListener("click", () => showView("spMapView"));
    scheduleCampaignPrefetch();
  });

  socket.on("singlePlayer:stageResult", payload => {
    window.SinglePlayerStageResult?.show(payload);
  });

  socket.on("singlePlayer:error", payload => {
    if (typeof toast === "function") toast(payload?.error || "Campaign error.");
  });
})();
