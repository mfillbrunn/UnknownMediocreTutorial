// ui/dom-watch.js -- one page-wide MutationObserver of each kind, shared.
//
// Six separate modules used to each construct their own MutationObserver
// over the whole document (five on `document.body` with
// {childList, subtree}, one on `document.documentElement` with an
// attribute filter). Every DOM write anywhere on the page therefore woke
// five independent callbacks, each re-deriving the same record list, and
// two of those five were byte-for-byte the same one-shot "has
// #spyChargeMeter appeared yet?" waiter.
//
// This module owns one structural observer and one attribute observer for
// the whole page and fans their records out to subscribers. Semantics per
// subscriber are unchanged: structural subscribers get the same records
// array they would have got from their own observer, and an attribute
// subscriber gets only the records matching the attribute names it asked
// for, even though the underlying observer watches the union of every
// subscriber's filter.
//
// Both observers are ref-counted: nothing is observed until the first
// subscriber arrives, and the observer is disconnected again when the
// last one leaves. That matters for the attribute watch in particular,
// which only exists while a tutorial step is waiting on a condition.
(() => {
  "use strict";

  // ------------------------------------------------------------------
  // structural: childList + subtree on document.body
  // ------------------------------------------------------------------

  const structuralSubs = new Set();
  let structuralObserver = null;

  function dispatchStructural(records) {
    // Snapshot: a subscriber is free to unsubscribe (or subscribe) from
    // inside its own callback, and whenPresent() below does exactly that.
    for (const cb of Array.from(structuralSubs)) {
      if (!structuralSubs.has(cb)) continue;
      try {
        cb(records);
      } catch (err) {
        // One broken subscriber must not swallow the batch for the rest.
        console.error("[dom-watch] structural subscriber failed", err);
      }
    }
  }

  function whenBody(fn) {
    if (document.body) {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    }
  }

  function startStructural() {
    if (structuralObserver || typeof MutationObserver === "undefined") return;
    whenBody(() => {
      // Everyone may have unsubscribed while we waited for the body.
      if (structuralObserver || !structuralSubs.size || !document.body) return;
      structuralObserver = new MutationObserver(dispatchStructural);
      structuralObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  function stopStructuralIfIdle() {
    if (structuralSubs.size || !structuralObserver) return;
    structuralObserver.disconnect();
    structuralObserver = null;
  }

  function onStructure(cb) {
    if (typeof cb !== "function") return () => {};
    structuralSubs.add(cb);
    startStructural();

    let live = true;
    return () => {
      if (!live) return;
      live = false;
      structuralSubs.delete(cb);
      stopStructuralIfIdle();
    };
  }

  // ------------------------------------------------------------------
  // attributes: attributes + subtree on document.documentElement
  // ------------------------------------------------------------------

  const attributeSubs = new Set();
  let attributeObserver = null;
  let attributeKey = "";

  // A subscriber with `names === null` wants every attribute, which forces
  // the shared observer to drop its filter entirely.
  function attributeOptions() {
    const names = new Set();
    let unfiltered = false;

    for (const sub of attributeSubs) {
      if (!sub.names) {
        unfiltered = true;
        break;
      }
      sub.names.forEach(name => names.add(name));
    }

    const options = { attributes: true, subtree: true };
    if (!unfiltered) options.attributeFilter = Array.from(names).sort();
    return options;
  }

  function dispatchAttributes(records) {
    for (const sub of Array.from(attributeSubs)) {
      if (!attributeSubs.has(sub)) continue;

      // The shared observer watches the union of every filter, so hand
      // each subscriber only the records it actually asked to see.
      const own = sub.names
        ? records.filter(record => sub.names.includes(record.attributeName))
        : records;
      if (!own.length) continue;

      try {
        sub.cb(own);
      } catch (err) {
        console.error("[dom-watch] attribute subscriber failed", err);
      }
    }
  }

  // Re-observing with a wider filter means tearing the observer down and
  // building it again; the key keeps that to the times the union changes.
  function syncAttributeObserver() {
    if (typeof MutationObserver === "undefined") return;

    if (!attributeSubs.size) {
      if (attributeObserver) {
        attributeObserver.disconnect();
        attributeObserver = null;
      }
      attributeKey = "";
      return;
    }

    const options = attributeOptions();
    const key = options.attributeFilter
      ? options.attributeFilter.join(",")
      : "*";
    if (attributeObserver && key === attributeKey) return;

    if (attributeObserver) attributeObserver.disconnect();
    attributeObserver = new MutationObserver(dispatchAttributes);
    attributeObserver.observe(document.documentElement, options);
    attributeKey = key;
  }

  function onAttribute(names, cb) {
    if (typeof cb !== "function") return () => {};

    const sub = {
      names: Array.isArray(names) && names.length ? names.slice() : null,
      cb
    };
    attributeSubs.add(sub);
    syncAttributeObserver();

    let live = true;
    return () => {
      if (!live) return;
      live = false;
      attributeSubs.delete(sub);
      syncAttributeObserver();
    };
  }

  // ------------------------------------------------------------------
  // whenPresent: the one-shot "wait for an element to show up" pattern
  // ------------------------------------------------------------------

  // `check` is polled once now and then once per structural batch until it
  // returns truthy, at which point the subscription is dropped for good.
  // `onLate` runs only when the check resolves through the observer -- an
  // element that is already there resolves synchronously, before the
  // caller has finished its own setup, and its callers do that follow-up
  // work themselves in that case.
  function whenPresent(check, onLate) {
    if (typeof check !== "function") return () => {};
    if (check()) return () => {};

    let done = false;
    const stop = onStructure(() => {
      if (done || !check()) return;
      done = true;
      stop();
      try {
        onLate?.();
      } catch (err) {
        console.error("[dom-watch] whenPresent callback failed", err);
      }
    });

    return () => {
      done = true;
      stop();
    };
  }

  window.DomWatch = { onStructure, onAttribute, whenPresent };
})();
