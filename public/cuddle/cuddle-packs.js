/* Cuddle: Upgrade Packs.
 *
 * After a stage is solved (not a boss, not a Duel), there is a chance that
 * an Upgrade Pack is offered on the way back to the map -- only if the
 * player can afford one. It comes in three sizes, picked at random from
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

  var OFFER_CHANCE = 0.3;
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
  var REVEAL_STEP_MS = 520;

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
      if (!state.umtPackOffer && randomFor(this)() < OFFER_CHANCE) {
        var world = worldIndex(state);
        var wallet = Number(state.cuddleMoney) || 0;
        var affordable = SIZES.filter(function canPay(size) { return size.prices[world] <= wallet; });
        if (affordable.length) {
          var size = affordable[Math.floor(randomFor(this)() * affordable.length)];
          state.umtPackOffer = {
            id: (state.runId || "run") + ":" + (state.round || 0) + ":pack",
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
    state.lastMessage = "Upgrade Pack opened: " + kept.map(function title(card) { return card.title; }).join(", ") + ".";
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
    var short = wallet < offer.price;
    var size = sizeOf(offer);
    var total = size.commons + size.specials;
    var words = ["no", "one", "two", "three"];
    var lines = "";
    if (size.commons) lines += '<li><b class="is-common">' + size.commons + " Common</b> upgrade" + (size.commons === 1 ? "" : "s") + "</li>";
    lines += '<li><b class="is-special">' + size.specials + " special" + (size.specials === 1 ? "" : "s") + "</b>"
      + (size.specials > 1 ? " (each rolled)" : "") + ': <span class="is-rare">Rare</span> 75% · <span class="is-epic">Epic</span> 20% · <span class="is-legendary">Legendary</span> 5%</li>';
    lines += "<li>" + (total === 2 ? "You keep both." : "You keep all " + (words[total] || total) + ".") + "</li>";
    var title = size.name ? "A " + size.name + " Upgrade Pack is for sale" : "An Upgrade Pack is for sale";
    return '<section class="umt-pack-dialog" role="dialog" aria-modal="true" aria-labelledby="umtPackTitle">'
      + '<span class="umt-pack-kicker">Stage cleared · World ' + offer.world + "</span>"
      + '<h2 id="umtPackTitle">' + title + "</h2>"
      + '<div class="umt-pack-sealed is-' + size.id + '" aria-hidden="true"><span class="umt-pack-foil"></span>'
      + '<span class="umt-pack-name">' + (size.name ? size.name + "<br>" : "") + "Pack</span><span class=\"umt-pack-count\">" + total + " upgrades</span></div>"
      + '<ul class="umt-pack-odds">' + lines + "</ul>"
      + '<div class="umt-pack-actions">'
      + '<button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-pack="buy"' + (short ? " disabled" : "") + ">Buy for $" + offer.price + "</button>"
      + '<button type="button" class="cuddle-btn cuddle-btn-ghost" data-umt-pack="skip">No thanks</button>'
      + "</div>"
      + '<p class="umt-pack-wallet">' + (short ? "You have $" + wallet + ": not enough for this pack." : "You have $" + wallet + ".") + "</p>"
      + "</section>";
  }

  function openedHtml(offer) {
    var elapsed = Math.max(0, Date.now() - (Number(offer.openedAt) || 0));
    var cards = offer.cards.map(function card(item, index) {
      var tier = TIER_LABEL[item.tier] ? item.tier : "common";
      return '<article class="umt-pack-card is-' + tier + '" style="--reveal-delay:' + (index * REVEAL_STEP_MS - elapsed) + 'ms">'
        + '<span class="umt-pack-card-tier">' + TIER_LABEL[tier] + "</span>"
        + '<span class="umt-pack-card-icon">' + icon(item) + "</span>"
        + "<strong>" + escapeHtml(item.title) + "</strong>"
        + "<small>" + escapeHtml(item.description) + "</small>"
        + "</article>";
    }).join("");
    return '<section class="umt-pack-dialog is-opened" role="dialog" aria-modal="true" aria-labelledby="umtPackTitle">'
      + '<span class="umt-pack-kicker">Upgrade Pack opened</span>'
      + '<h2 id="umtPackTitle">' + (offer.cards.length === 2 ? "Both are yours" : offer.cards.length === 1 ? "It's yours" : "All " + (["", "", "two", "three"][offer.cards.length] || offer.cards.length) + " are yours") + "</h2>"
      + '<div class="umt-pack-cards">' + cards + "</div>"
      + '<div class="umt-pack-actions"><button type="button" class="cuddle-btn cuddle-btn-primary" data-umt-pack="close">Back to the map</button></div>'
      + "</section>";
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
      var result = game.buyUpgradePack();
      if (!result.ok) {
        var note = document.querySelector(".umt-pack-wallet");
        if (note) note.textContent = result.error;
        return;
      }
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
