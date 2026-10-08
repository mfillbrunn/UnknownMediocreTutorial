/* Cuddle: Upgrade Packs.
 *
 * Once per world, after one of its first few solved stages (not a boss,
 * not a Duel), an Upgrade Pack is offered on the way back to the map --
 * only if the player can afford one; if not, it waits for a later stage of
 * the same world. It comes in three sizes, picked at random from
 * the ones the wallet covers:
 *   Small   1 Common + 1 special
 *   Medium  1 Common + 2 specials
 *   Large   3 specials
 * Each special is rolled on its own: Rare (most often), Epic (less often)
 * or Legendary (rarely). Buying opens the pack and keeps every card. Prices
 * rise with the world.
 *
 * The offer lives on the run (state.umtPackOffer), so a reload shows it
 * again, and its overlay sits outside #cuddleRoot so re-renders leave it
 * alone.
 */
(function () {
  "use strict";

  var Engine = window.CuddleEngine;
  if (!Engine || !Engine.CuddleGame) return;
  var proto = Engine.CuddleGame.prototype;
  if (proto.__cuddlePacks) return;
  proto.__cuddlePacks = true;

  // A world offers one pack, on one of its first OFFER_WINDOW solved stages.
  var OFFER_WINDOW = 3;
  // Three sizes, each priced by world (well under what the same cards
  // cost in the shop). Only sizes the player can afford are offered; the
  // offer picks one of those at random.
  var SIZES = Object.freeze([
    Object.freeze({ id: "small", name: "Small", commons: 1, specials: 1, prices: [35, 45, 55] }),
    Object.freeze({ id: "medium", name: "Medium", commons: 1, specials: 2, prices: [55, 70, 85] }),
    Object.freeze({ id: "large", name: "Large", commons: 0, specials: 3, prices: [75, 95, 115] })
  ]);
  var SPECIAL_ODDS = [["rare", 75], ["epic", 20], ["legendary", 5]];
  var TIER_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
  // The opening, in four beats: shake, swell, rip (with a spray of
  // sparkles), then the badges fly out of the torn pack.
  var SHAKE_MS = 620;
  var SWELL_MS = 340;
  var RIP_MS = 520;
  var REVEAL_STEP_MS = 230;
  var BURST_MS = 260;
  var FLY_MS = 720;
  // The top edge of the tear, as a jagged line across the pack.
  var TEAR = "0 24%, 9% 19%, 18% 26%, 29% 18%, 40% 25%, 51% 19%, 62% 26%, 73% 18%, 84% 25%, 93% 19%, 100% 24%";
  var TEAR_REVERSED = TEAR.split(", ").reverse().join(", ");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function inDuel(state) {
    return String((state && state.runId) || "").indexOf(":duel:") !== -1;
  }

  function worldIndex(state) {
    var cleared = Array.isArray(state && state.bossGatesDone) ? state.bossGatesDone.length : 0;
    return Math.max(0, Math.min(2, cleared));
  }

  // Per world: solved stages seen, and whether its pack was offered.
  function packTrack(state) {
    var track = state.umtPackTrack;
    if (!track || typeof track !== "object" || !Array.isArray(track.seen) || !Array.isArray(track.offered)) {
      track = state.umtPackTrack = { seen: [0, 0, 0], offered: [false, false, false] };
    }
    return track;
  }

  function randomFor(game) {
    return typeof game.random === "function" ? game.random : Math.random;
  }

  // Offers saved before sizes existed were the old 2 Commons + 1 special.
  function sizeOf(offer) {
    for (var i = 0; i < SIZES.length; i += 1) if (offer && SIZES[i].id === offer.size) return SIZES[i];
    return { id: "classic", name: "", commons: 2, specials: 1, prices: [] };
  }

  function rollSpecialTier(random) {
    var total = SPECIAL_ODDS.reduce(function sum(acc, entry) { return acc + entry[1]; }, 0);
    var roll = random() * total;
    for (var i = 0; i < SPECIAL_ODDS.length; i += 1) {
      roll -= SPECIAL_ODDS[i][1];
      if (roll < 0) return SPECIAL_ODDS[i][0];
    }
    return SPECIAL_ODDS[0][0];
  }

  function save(game) {
    try {
      if (typeof game.save === "function") game.save();
    } catch (_error) {
      // A pack is never worth a crash.
    }
  }

  // A solved ordinary stage makes the trip back to the map eligible.
  var baseResolve = proto._resolvePendingRoundEnd;
  proto._resolvePendingRoundEnd = function resolvePendingRoundEndWithPacks() {
    var state = this.state;
    var pending = state && state.pendingRoundEnd;
    var eligible = Boolean(pending && pending.type === "solved" && !inDuel(state)
      && !(typeof this.isBossRound === "function" && this.isBossRound()));
    var result = baseResolve.apply(this, arguments);
    if (eligible && this.state && this.state.status !== "won" && this.state.status !== "lost") {
      this.state.umtPackEligible = true;
    }
    return result;
  };

  var baseAdvance = proto._advanceRound;
  proto._advanceRound = function advanceRoundWithPacks() {
    var result = baseAdvance.apply(this, arguments);
    var state = this.state;
    if (state && state.umtPackEligible && state.status === "branchMap") {
      state.umtPackEligible = false;
      var world = worldIndex(state);
      var track = packTrack(state);
      var seen = track.seen[world] || 0;
      track.seen[world] = seen + 1;
      // One pack per world, on one of its first few solved stages (evenly
      // spread): 1 in 3 on the first, 1 in 2 on the second, then certain.
      if (!state.umtPackOffer && !track.offered[world]
          && randomFor(this)() < 1 / Math.max(1, OFFER_WINDOW - seen)) {
        var wallet = Number(state.cuddleMoney) || 0;
        var affordable = SIZES.filter(function canPay(size) { return size.prices[world] <= wallet; });
        // Short of money: the pack waits for a later stage of this world.
        if (affordable.length) {
          var size = affordable[Math.floor(randomFor(this)() * affordable.length)];
          track.offered[world] = true;
          state.umtPackOffer = {
            id: (window.CuddleSeed ? window.CuddleSeed.text(state) : (state.runId || "run")) + ":" + (state.round || 0) + ":pack",
            size: size.id,
            price: size.prices[world],
            world: world + 1,
            cards: null
          };
        }
      }
      save(this);
      schedule();
    }
    return result;
  };

  proto.buyUpgradePack = function buyUpgradePack() {
    var state = this.state;
    var offer = state && state.umtPackOffer;
    if (!offer || offer.cards) return { ok: false, error: "There is no pack to buy." };
    var wallet = Number(state.cuddleMoney) || 0;
    if (wallet < offer.price) return { ok: false, error: "You need $" + offer.price + " for this pack." };
    var api = window.CuddleEconomyRarityV8;
    if (!api || typeof api.packRewards !== "function" || typeof this._grantUpgradeChoice !== "function") {
      return { ok: false, error: "Packs can't be opened right now." };
    }
    var size = sizeOf(offer);
    var random = randomFor(this);
    var specials = [];
    for (var slot = 0; slot < size.specials; slot += 1) specials.push(rollSpecialTier(random));
    var cards = api.packRewards(this, specials, offer.id + ":" + specials.join("-"), size.commons) || [];
    if (!cards.length) return { ok: false, error: "There are no upgrades left to put in a pack." };
    var game = this;
    var kept = [];
    cards.forEach(function grant(card) {
      var choice = {
        id: card.id,
        key: card.key,
        title: card.title,
        description: card.description,
        icon: card.icon,
        __cuddleV8Effect: card.__cuddleV8Effect
      };
      var applied;
      try {
        applied = game._grantUpgradeChoice(choice);
      } catch (_error) {
        applied = null;
      }
      if (applied && applied.ok !== false) kept.push(card);
    });
    if (!kept.length) return { ok: false, error: "None of the pack's upgrades could be taken." };
    state.cuddleMoney = wallet - offer.price;
    offer.cards = kept.map(function plain(card) {
      return { id: card.id, title: card.title, description: card.description, icon: card.icon, tier: card.tier };
    });
    offer.openedAt = Date.now();
    state.lastMessage = (offer.starter ? "Starting Pack opened: " : "Upgrade Pack opened: ") + kept.map(function title(card) { return card.title; }).join(", ") + ".";
    save(this);
    return { ok: true, cards: offer.cards };
  };

  proto.closeUpgradePack = function closeUpgradePack() {
    if (!this.state) return { ok: false };
    this.state.umtPackOffer = null;
    save(this);
    return { ok: true };
  };

  // --- Overlay -------------------------------------------------------

  function activeGame() {
    try {
      return window.CuddleBranchMap && typeof window.CuddleBranchMap.getActiveGame === "function"
        ? window.CuddleBranchMap.getActiveGame()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function icon(card) {
    var library = window.CuddleIcons;
    if (library && card.icon && typeof library.hasEmoji === "function" && library.hasEmoji(card.icon)) {
      try {
        return library.svg(card.icon);
      } catch (_error) {
        // Fall back to the emoji below.
      }
    }
    return escapeHtml(card.icon || "★");
  }

  function sealedHtml(offer, wallet) {
    var short = !offer.starter && wallet < offer.price;
    var size = sizeOf(offer);
    var total = size.commons + size.specials;
    var name = (size.name ? size.name + " " : "") + "Pack";
    var title = offer.starter ? "Your Starting Pack" : "A " + name + " is for sale";
    var kicker = offer.starter ? "Starting bonus" : "Stage cleared · World " + offer.world;
    // The pack itself opens it too (when it can be opened).
    return '<section class="umt-pack-dialog" role="dialog" aria-modal="true" aria-labelledby="umtPackTitle">'
      + '<span class="umt-pack-kicker">' + kicker + "</span>"
      + '<h2 id="umtPackTitle">' + title + "</h2>"
      + '<div class="umt-pack-stage">'
      + '<button type="button" class="umt-pack-sealed is-' + size.id + '" data-umt-pack="buy"' + (short ? " disabled" : "")
      + ' aria-label="' + (offer.starter ? "Open the pack" : "Buy and open the pack for $" + offer.price) + '">'
      + '<span class="umt-pack-foil" aria-hidden="true"></span>'
      + '<span class="umt-pack-name">' + (size.name ? size.name + "<br>" : "") + "Pack</span>"
      + '<span class="umt-pack-count">' + total + " upgrades</span></button></div>"
      + '<div class="umt-pack-actions">'
      + (offer.starter
        ? '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-pack="buy">Open the pack</button>'
        : '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-pack="buy"' + (short ? " disabled" : "") + ">Buy for $" + offer.price + "</button>"
          + '<button type="button" class="cuddle-btn cuddle-btn-ghost" data-umt-pack="skip">No thanks</button>')
      + "</div>"
      + (offer.starter ? "" : '<p class="umt-pack-wallet">' + (short ? "You have $" + wallet + ": not enough for this pack." : "You have $" + wallet + ".") + "</p>")
      + "</section>";
  }

  function openedHtml(offer) {
    var cards = offer.cards.map(function card(item, index) {
      var tier = TIER_LABEL[item.tier] ? item.tier : "common";
      // Twinkles around the badge, and the badge itself bobs and catches
      // the light once it has landed (cuddle-packs.css).
      return '<article class="umt-pack-card is-' + tier + '" style="--idle-delay:' + (1300 + index * REVEAL_STEP_MS) + 'ms">'
        + '<span class="umt-pack-twinkle" aria-hidden="true"></span><span class="umt-pack-twinkle" aria-hidden="true"></span><span class="umt-pack-twinkle" aria-hidden="true"></span>'
        + '<span class="umt-pack-card-icon">' + icon(item) + "</span>"
        + '<span class="umt-pack-card-tier">' + TIER_LABEL[tier] + "</span>"
        + "<strong>" + escapeHtml(item.title) + "</strong>"
        + "<small>" + escapeHtml(item.description) + "</small>"
        + "</article>";
    }).join("");
    var count = offer.cards.length;
    return '<section class="umt-pack-dialog is-opened" role="dialog" aria-modal="true" aria-labelledby="umtPackTitle">'
      + '<div class="umt-pack-burst" aria-hidden="true"><span class="umt-pack-glow"></span>'
      + '<span class="umt-pack-half is-top"></span><span class="umt-pack-half is-bottom"></span></div>'
      + '<h2 id="umtPackTitle">' + (count === 2 ? "Both are yours" : count === 1 ? "It's yours" : "All " + (["", "", "two", "three"][count] || count) + " are yours") + "</h2>"
      + '<div class="umt-pack-cards">' + cards + "</div>"
      + '<div class="umt-pack-actions"><button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-pack="close">Back to the map</button></div>'
      + "</section>";
  }

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (_error) {
      return false;
    }
  }

  // A spray of sparkles from (x, y) inside `host`, which must be
  // positioned. Purely for show, so it uses Math.random, not the run's dice.
  function sparkleBurst(host, x, y, count, delayMs) {
    if (!host || reducedMotion()) return;
    var colours = ["#fff6d6", "#f0ca5e", "#ffe08a", "#d5a6ff", "#8be8d2"];
    for (var i = 0; i < count; i += 1) {
      var spark = document.createElement("span");
      spark.className = "umt-pack-spark" + (i % 3 === 0 ? " is-dot" : "");
      spark.setAttribute("aria-hidden", "true");
      spark.style.left = x + "px";
      spark.style.top = y + "px";
      spark.style.background = colours[i % colours.length];
      host.appendChild(spark);
      var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      // Mostly upward, like light spilling out of the opening.
      var reach = 70 + Math.random() * 110;
      var dx = Math.cos(angle) * reach;
      var dy = Math.sin(angle) * reach * 0.8 - 40;
      var size = 0.6 + Math.random() * 0.9;
      var spin = Math.round((Math.random() - 0.5) * 360);
      var duration = 700 + Math.random() * 500;
      if (typeof spark.animate !== "function") { spark.remove(); continue; }
      var anim = spark.animate([
        { transform: "translate(-50%, -50%) scale(0) rotate(0deg)", opacity: 1 },
        { transform: "translate(calc(-50% + " + (dx * 0.6) + "px), calc(-50% + " + (dy * 0.6) + "px)) scale(" + size + ") rotate(" + (spin / 2) + "deg)", opacity: 1, offset: 0.45 },
        { transform: "translate(calc(-50% + " + dx + "px), calc(-50% + " + (dy + 30) + "px)) scale(0) rotate(" + spin + "deg)", opacity: 0 }
      ], { duration: duration, delay: (delayMs || 0) + Math.random() * 120, easing: "cubic-bezier(.15,.7,.3,1)", fill: "both" });
      anim.onfinish = (function bind(el) { return function done() { el.remove(); }; }(spark));
    }
  }

  // The badges fly out of the torn pack to their places, one after another,
  // after a second spray of sparkles. Timed from offer.openedAt, so a
  // re-render mid-flight resumes it.
  function flyOut(root, offer) {
    var burst = root.querySelector(".umt-pack-burst");
    if (!burst || reducedMotion()) return;
    var elapsed = Math.max(0, Date.now() - (Number(offer.openedAt) || 0));
    if (elapsed < 300) sparkleBurst(burst, burst.offsetWidth / 2, burst.offsetHeight / 2, 22, 0);
    var from = burst.getBoundingClientRect();
    var fx = from.left + from.width / 2;
    var fy = from.top + from.height / 2;
    [].forEach.call(root.querySelectorAll(".umt-pack-card"), function fly(card, index) {
      if (typeof card.animate !== "function") return;
      var box = card.getBoundingClientRect();
      var dx = Math.round(fx - (box.left + box.width / 2));
      var dy = Math.round(fy - (box.top + box.height / 2));
      var spin = index % 2 === 0 ? -22 : 22;
      card.animate([
        { transform: "translate(" + dx + "px, " + dy + "px) scale(0.12) rotate(" + spin + "deg)", opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: "translate(" + Math.round(dx * 0.35) + "px, " + Math.round(dy * 0.35 - 30) + "px) scale(0.7) rotate(" + (-spin / 2) + "deg)", offset: 0.5 },
        { transform: "translate(0, -8px) scale(1.07) rotate(0deg)", offset: 0.82 },
        { transform: "none", opacity: 1 }
      ], {
        duration: FLY_MS,
        delay: BURST_MS + index * REVEAL_STEP_MS - elapsed,
        easing: "cubic-bezier(.2,.8,.25,1)",
        fill: "backwards"
      });
      // Each badge lands with a flash in its tier's colour.
      var flash = card.querySelector(".umt-pack-card-icon");
      if (flash && typeof flash.animate === "function") {
        flash.animate([
          { filter: "brightness(2.2) drop-shadow(0 0 14px var(--tier))" },
          { filter: "brightness(1) drop-shadow(0 0 0 transparent)" }
        ], { duration: 520, delay: BURST_MS + index * REVEAL_STEP_MS + FLY_MS * 0.8 - elapsed, easing: "ease-out", fill: "backwards" });
      }
    });
  }

  // The tap: the pack shakes harder and harder, swells, then rips across
  // the top -- the flap flies off and sparkles spill out -- and only then
  // does the purchase go through and the badges appear.
  function openWithFlourish(game, button) {
    var dialog = button.closest(".umt-pack-dialog");
    var pack = dialog && dialog.querySelector(".umt-pack-sealed");
    var stage = dialog && dialog.querySelector(".umt-pack-stage");
    if (!pack || !stage || pack.classList.contains("is-opening")) return;
    var finish = function finish() {
      var result = game.buyUpgradePack();
      if (!result.ok) {
        // Back to the sealed pack, with the reason.
        shownKey = "";
        var overlay = document.querySelector(".umt-pack-overlay");
        if (overlay) overlay.innerHTML = "";
        sync();
        var note = document.querySelector(".umt-pack-wallet");
        if (!note) {
          note = document.createElement("p");
          note.className = "umt-pack-wallet";
          var fresh = document.querySelector(".umt-pack-dialog");
          if (fresh) fresh.appendChild(note);
        }
        note.textContent = result.error;
        return;
      }
      refreshGame(game);
    };
    if (reducedMotion() || typeof pack.animate !== "function") {
      finish();
      return;
    }
    [].forEach.call(dialog.querySelectorAll("[data-umt-pack]"), function disable(el) { el.disabled = true; });
    pack.classList.add("is-opening");

    // 1. Shake, harder and faster toward the end.
    pack.animate([
      { transform: "rotate(0deg)" },
      { transform: "translateX(-2px) rotate(-2deg)", offset: 0.1 },
      { transform: "translateX(2px) rotate(2deg)", offset: 0.2 },
      { transform: "translateX(-4px) rotate(-4deg)", offset: 0.32 },
      { transform: "translateX(4px) rotate(4deg)", offset: 0.44 },
      { transform: "translateX(-6px) rotate(-6deg)", offset: 0.55 },
      { transform: "translateX(6px) rotate(6deg)", offset: 0.65 },
      { transform: "translateX(-7px) rotate(-7deg)", offset: 0.74 },
      { transform: "translateX(7px) rotate(7deg)", offset: 0.82 },
      { transform: "translateX(-5px) rotate(-5deg)", offset: 0.89 },
      { transform: "translateX(4px) rotate(3deg)", offset: 0.95 },
      { transform: "rotate(0deg)" }
    ], { duration: SHAKE_MS, easing: "linear" });

    // 2. Swell, with the glow rising.
    stage.animate([
      { transform: "scale(1)", filter: "drop-shadow(0 0 0 rgba(240, 202, 94, 0))" },
      { transform: "scale(1.32)", filter: "drop-shadow(0 0 26px rgba(240, 202, 94, 0.85))" }
    ], { duration: SWELL_MS, delay: SHAKE_MS, easing: "cubic-bezier(.3,1.5,.6,1)", fill: "forwards" });

    // 3. Rip: the top flap tears off and flies away; light and sparkles
    // spill from the opening.
    setTimeout(function rip() {
      var flap = pack.cloneNode(true);
      flap.removeAttribute("data-umt-pack");
      flap.removeAttribute("aria-label");
      flap.setAttribute("aria-hidden", "true");
      flap.setAttribute("tabindex", "-1");
      flap.className = pack.className + " umt-pack-flap";
      flap.style.clipPath = "polygon(0 0, 100% 0, " + TEAR_REVERSED + ")";
      pack.style.clipPath = "polygon(" + TEAR + ", 100% 100%, 0 100%)";
      stage.appendChild(flap);
      flap.animate([
        { transform: "none", opacity: 1 },
        { transform: "translate(-18px, -46px) rotate(-22deg)", opacity: 1, offset: 0.45 },
        { transform: "translate(-60px, -110px) rotate(-48deg)", opacity: 0 }
      ], { duration: RIP_MS + 200, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
      var light = document.createElement("span");
      light.className = "umt-pack-light";
      light.setAttribute("aria-hidden", "true");
      stage.appendChild(light);
      var tearY = pack.offsetTop + pack.offsetHeight * 0.22;
      light.style.top = tearY + "px";
      sparkleBurst(stage, pack.offsetLeft + pack.offsetWidth / 2, tearY, 28, 40);
      pack.animate([
        { transform: "translateY(0)" },
        { transform: "translateY(6px)", offset: 0.3 },
        { transform: "translateY(0)" }
      ], { duration: 260, easing: "ease-out" });
    }, SHAKE_MS + SWELL_MS);

    // 4. The badges (the opened screen takes over).
    setTimeout(finish, SHAKE_MS + SWELL_MS + RIP_MS);
  }

  var shownKey = "";

  function sync() {
    var game = activeGame();
    var state = game && game.state;
    var offer = state && state.umtPackOffer;
    var screen = document.getElementById("cuddleScreen") || document.body;
    var existing = document.querySelector(".umt-pack-overlay");
    // The stage's cash-out plays over the map first; the pack waits for
    // Collect.
    var money = window.CuddleMoneyMode;
    // So does the badge board that reveals the stage's reward.
    var cashingOut = Boolean(document.getElementById("cuddleMoneyPayoutOverlay")
      || document.querySelector(".umt-pt-overlay")
      || (money && typeof money.payoutActive === "function" && money.payoutActive())
      || (state && state.cuddleMoneyMode && state.cuddleMoneyMode.pendingPayout));
    var visible = Boolean(offer && state.status === "branchMap" && !cashingOut && document.getElementById("cuddleRoot"));
    if (!visible) {
      if (existing) existing.remove();
      shownKey = "";
      return;
    }
    var wallet = Number(state.cuddleMoney) || 0;
    var key = offer.id + ":" + (offer.cards ? "open" : "sealed:" + wallet);
    if (existing && key === shownKey) return;
    if (!existing) {
      existing = document.createElement("div");
      existing.className = "umt-pack-overlay";
      screen.appendChild(existing);
    }
    shownKey = key;
    existing.innerHTML = offer.cards ? openedHtml(offer) : sealedHtml(offer, wallet);
    if (offer.cards) flyOut(existing, offer);
    var focus = existing.querySelector("[data-umt-pack]:not([disabled])");
    if (focus) focus.focus();
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var run = function run() { pending = false; sync(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function refreshGame(game) {
    window.dispatchEvent(new Event("cuddle:campaign-update"));
    schedule();
    return game;
  }

  document.addEventListener("click", function onPackClick(event) {
    var button = event.target.closest && event.target.closest("[data-umt-pack]");
    if (!button) return;
    var game = activeGame();
    if (!game) return;
    var action = button.getAttribute("data-umt-pack");
    if (action === "buy") {
      openWithFlourish(game, button);
      return;
    } else if (action === "skip" || action === "close") {
      game.closeUpgradePack();
    }
    refreshGame(game);
  });

  function attach() {
    var root = document.getElementById("cuddleRoot");
    if (!root) {
      document.addEventListener("DOMContentLoaded", attach, { once: true });
      return;
    }
    // The cash-out and the badge board open and close outside the map's
    // own render, so watch the whole Cuddle screen.
    var screen = document.getElementById("cuddleScreen") || document.body;
    new MutationObserver(schedule).observe(screen, { childList: true, subtree: true });
    window.addEventListener("cuddle:campaign-update", schedule);
    schedule();
  }

  attach();
}());
