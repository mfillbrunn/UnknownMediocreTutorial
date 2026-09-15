/* CUDDLE_SHOP_LOCKIN v2
 * Loaded deferred, after cuddle-economy-rarity-v8.js, deliberately last --
 * see cuddle-stability-v2.js's own comment where window.__cuddleShopFinal
 * is set for the full story. Short version: economy-rarity-v8.js's generic
 * method-instrumentation pass re-wraps proto.getCuddleShop and
 * proto.buyCuddleShopItem (along with almost every other method it can
 * find) for its own reward-theming bookkeeping, and its shop-shaped-array
 * heuristic then pads the shop's item list out with an entirely separate
 * "pouch" reward economy of its own, while its "Cuddle Meter" heuristic
 * separately makes a real purchase call substitute an unrelated reward
 * grant instead -- charging nothing and unlocking nothing, silently.
 *
 * A one-time restore (just reassigning the two methods back to their
 * pristine functions) turned out not to be enough: that instrumentation
 * re-scans and re-wraps methods repeatedly through the game's lifecycle,
 * not only once at load, so a plain reassignment here would already have
 * been re-wrapped again by the time a player actually opens the shop.
 *
 * Instead, both methods are redefined as accessor properties -- a getter
 * that always returns the one pristine function, and a setter that
 * quietly discards whatever anyone tries to assign afterward. The
 * generic patcher's own guard (it reads a property descriptor and gives
 * up immediately unless that descriptor has a plain function `value`,
 * exactly the shape a normal method assignment has and an accessor
 * property does not) is what makes this actually stick -- it isn't
 * fooled into wrapping either method again, this time or any later time
 * a re-scan happens.
 */
(function lockInCuddleShop() {
  "use strict";

  var Engine = window.CuddleEngine;
  var final = window.__cuddleShopFinal;
  if (!Engine || !Engine.CuddleGame || !Engine.CuddleGame.prototype || !final) {
    console.error("Cuddle Shop Lock-in: nothing to lock in (engine or shop functions missing).");
    return;
  }

  var proto = Engine.CuddleGame.prototype;

  function lockMethod(name, fn) {
    try {
      Object.defineProperty(proto, name, {
        configurable: false,
        enumerable: true,
        get: function () { return fn; },
        // Silently absorb any later `proto.x = ...`/instrumentation
        // assignment rather than throwing (this runs inside other code's
        // generic passes, which don't expect a set to fail loudly).
        set: function () {}
      });
    } catch (error) {
      console.error("Cuddle Shop Lock-in: could not lock " + name + ".", error);
    }
  }

  lockMethod("getCuddleShop", final.getShop);
  lockMethod("buyCuddleShopItem", final.buyItem);
})();
