// public/single-player/single-player.js
//
// Core campaign client module: an auth-token-bearing socket wrapper, the
// shared SinglePlayerCampaign namespace, and navigation between
// #singlePlayerScreen's sub-views. campaign-map.js / story-player.js /
// stage-result.js / achievements.js all render into those sub-views and
// call back into the methods exposed here -- none of them touch the
// multiplayer engine directly.
//
// Once a stage's match actually starts, this file does exactly what
// window.createRoom's own success handler already does (persistRoom /
// window.roomId / markFreshGameState) and sweeps every menu screen the
// same way the server's "hideLobby" lobbyEvent does for a normal match
// (see client.js's onLobbyEvent) -- a campaign room never emits that
// event itself, since it starts straight in "simultaneous" phase rather
// than going through the manual lobby. From that point on the existing
// guesser/setter screens render the match exactly like any other game;
// nothing here reimplements any part of that.

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

  // Every campaign socket call carries a fresh Supabase access token; the
  // server derives the authenticated user from it and never trusts a
  // client-supplied userId (see server/single-player/socketHandlers.js).
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
          resolve(result || { ok: false, code: "NO_RESPONSE" });
        });
      });
    });
  }

  const VIEWS = ["spMapView", "spStoryView", "spResultView", "spAchievementsView"];
  function showView(id) {
    VIEWS.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.toggle("hidden", v !== id);
    });
  }

  function enterGameScreen() {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.body.classList.remove("menu-mode");
  }

  function joinRoom(roomId) {
    if (typeof persistRoom === "function") persistRoom(roomId);
    window.roomId = roomId;
    if (typeof markFreshGameState === "function") markFreshGameState();
  }

  async function refreshCampaign() {
    const result = await spEmit("singlePlayer:getCampaign", {});
    if (result.ok) SP.manifest = result;
    return result;
  }

  async function openCampaignScreen() {
    window.showScreen("singlePlayerScreen");
    showView("spMapView");
    const mapEl = document.getElementById("spMapNodes");
    if (mapEl) mapEl.innerHTML = "";
    if (mapEl) {
      const loading = document.createElement("div");
      loading.className = "sp-map-loading";
      loading.textContent = "Loading campaign…";
      mapEl.appendChild(loading);
    }
    const result = await refreshCampaign();
    if (!result.ok) {
      if (mapEl) {
        mapEl.innerHTML = "";
        const err = document.createElement("div");
        err.className = "sp-map-error";
        err.textContent = result.error || "Campaign unavailable right now.";
        mapEl.appendChild(err);
      }
      return;
    }
    window.SinglePlayerCampaignMap?.render(result);
  }

  async function startStage(stageId) {
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
    if (result.stage?.preStory?.frames?.length) {
      window.SinglePlayerStoryPlayer?.playPreStory(result.stage, result.roomId);
    } else {
      enterGameForActiveStage();
    }
    return result;
  }

  function enterGameForActiveStage() {
    enterGameScreen();
    joinRoom(SP.activeRoomId);
  }

  // After the result screen (and any reward choice) is dismissed: play
  // the stage's postStory if it has one, otherwise finalize the attempt
  // immediately.
  function advanceAfterResult() {
    const stage = SP.activeStage;
    if (stage?.postStory?.frames?.length) {
      window.SinglePlayerStoryPlayer?.playPostStory(stage, SP.activeRoomId);
    } else {
      finalizeStageAttempt();
    }
  }

  function finalizeStageAttempt() {
    const roomId = SP.activeRoomId;
    spEmit("singlePlayer:completeStage", { roomId }).then(() => {
      SP.activeStage = null;
      SP.activeRoomId = null;
      returnToMap();
    });
  }

  function returnToMap() {
    showView("spMapView");
    refreshCampaign().then(result => {
      if (result.ok) window.SinglePlayerCampaignMap?.render(result);
    });
  }

  const SP = {
    manifest: null,
    activeStage: null,
    activeRoomId: null,
    emit: spEmit,
    showView,
    enterGameScreen,
    joinRoom,
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
  });

  socket.on("singlePlayer:stageResult", payload => {
    window.SinglePlayerStageResult?.show(payload);
  });

  socket.on("singlePlayer:error", payload => {
    if (typeof toast === "function") toast(payload?.error || "Campaign error.");
  });
})();
