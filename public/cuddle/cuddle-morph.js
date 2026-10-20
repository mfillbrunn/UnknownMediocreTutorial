/* Cuddle: update the screen in place instead of rebuilding it.
 *
 * cuddle-ui.js renders the whole run as one HTML string on every tap.
 * Setting it with innerHTML threw away all ~1,600 elements and built them
 * again, so the browser restyled and laid out the whole screen, and every
 * bolt-on layer redecorated it from scratch: most of what a tap cost.
 *
 * update(root, html) parses the new HTML off-screen and changes only what
 * differs. It compares the new markup with the markup it rendered last
 * time, never with the live page:
 *   - an element that renders the same as last time is left alone, with
 *     everything inside it, including what other layers added to it;
 *   - an element whose content changed is treated as a rebuild would
 *     treat it: what other layers had added inside it is cleared (they
 *     add it again on their next pass), its rendered children are patched
 *     or replaced;
 *   - elements are matched by what they are (tag, id, card glyph, draft
 *     slot, action...), so a card that became another letter is a new
 *     element, not a reused one with stale decorations;
 *   - attributes and classes change one by one, keeping any another layer
 *     set.
 * When anything changed, an empty comment is added and removed at the
 * root, so every layer that watches for added/removed nodes runs its pass
 * just as it did after a rebuild.
 *
 * localStorage "umt-cuddle-morph" = "off" goes back to rebuilding.
 */
(function () {
  "use strict";

  if (window.CuddleMorph) return;

  // Rendered node -> the live node it became.
  var liveOf = new WeakMap();
  // Per root: the markup rendered last time, as a detached tree.
  var lastTree = new WeakMap();
  var changed = false;

  function enabled() {
    try { return window.localStorage.getItem("umt-cuddle-morph") !== "off"; } catch (_error) { return true; }
  }

  // Pairs a rendered tree with the live tree built from it, node by node.
  function mapTree(rendered, live) {
    liveOf.set(rendered, live);
    var r = rendered.firstChild;
    var l = live.firstChild;
    while (r && l) {
      mapTree(r, l);
      r = r.nextSibling;
      l = l.nextSibling;
    }
  }

  var KEY_ATTRS = ["id", "data-card-glyph", "data-draft-index", "data-drag-index", "data-upgrade-key", "data-shop-item-id",
    "data-action", "data-cuddle-campaign-action", "data-cuddle-money-action", "data-payout-row", "data-umt-badge", "data-node-id"];

  // What a node is, for matching: its tag, an identifying attribute and
  // its first class.
  function keyOf(node) {
    if (node.nodeType !== 1) return "#" + node.nodeType;
    var id = "";
    for (var i = 0; i < KEY_ATTRS.length; i += 1) {
      var value = node.getAttribute(KEY_ATTRS[i]);
      if (value != null) { id = KEY_ATTRS[i] + "=" + value; break; }
    }
    return node.tagName + "|" + id + "|" + (node.classList && node.classList[0] || "");
  }

  function splitClasses(value) {
    var set = {};
    String(value || "").split(/\s+/).forEach(function (name) { if (name) set[name] = true; });
    return set;
  }

  function patchAttributes(before, after, live) {
    var i;
    for (i = 0; i < before.attributes.length; i += 1) {
      var gone = before.attributes[i].name;
      if (after.hasAttribute(gone)) continue;
      if (gone === "class") {
        Object.keys(splitClasses(before.getAttribute("class"))).forEach(function (name) { live.classList.remove(name); });
      } else {
        live.removeAttribute(gone);
      }
      changed = true;
    }
    for (i = 0; i < after.attributes.length; i += 1) {
      var name = after.attributes[i].name;
      var value = after.attributes[i].value;
      var old = before.getAttribute(name);
      if (old === value) continue;
      changed = true;
      if (name === "class") {
        var was = splitClasses(old);
        var now = splitClasses(value);
        Object.keys(was).forEach(function (c) { if (!now[c]) live.classList.remove(c); });
        Object.keys(now).forEach(function (c) { if (!was[c]) live.classList.add(c); });
      } else {
        live.setAttribute(name, value);
        // A form field's shown value follows its attribute only until it is
        // typed in; keep the two together as a rebuild would have.
        if (name === "value" && "value" in live && live.value !== value) live.value = value;
        if (name === "checked" && "checked" in live) live.checked = true;
      }
    }
  }

  // A fresh live copy of a rendered node.
  function fresh(rendered) {
    var live = rendered.cloneNode(true);
    mapTree(rendered, live);
    changed = true;
    return live;
  }

  function patchChildren(before, after, live) {
    // Old rendered children by key, in order.
    var pool = {};
    var child;
    for (child = before.firstChild; child; child = child.nextSibling) {
      var k = keyOf(child);
      (pool[k] || (pool[k] = [])).push(child);
    }
    var reused = new Set();
    var placed = [];
    var next;
    for (child = after.firstChild; child; child = next) {
      next = child.nextSibling;
      var queue = pool[keyOf(child)];
      var match = queue && queue.length ? queue.shift() : null;
      var liveNode = match ? liveOf.get(match) : null;
      // Another layer removed it: render it anew.
      if (match && (!liveNode || liveNode.parentNode !== live)) { match = null; liveNode = null; }
      if (match) {
        reused.add(match);
        liveNode = patchNode(match, child, liveNode);
      } else {
        liveNode = fresh(child);
      }
      placed.push(liveNode);
    }
    // What other layers added inside a changed element goes, as in a
    // rebuild; they put it back on their next pass.
    var rendered = new Set(placed);
    var walk = live.firstChild;
    while (walk) {
      var after_ = walk.nextSibling;
      if (!rendered.has(walk)) { live.removeChild(walk); changed = true; }
      walk = after_;
    }
    var previous = null;
    for (var i = 0; i < placed.length; i += 1) {
      var node = placed[i];
      var expected = previous ? nextRendered(previous.nextSibling, rendered) : nextRendered(live.firstChild, rendered);
      if (node.parentNode !== live || expected !== node) {
        live.insertBefore(node, previous ? previous.nextSibling : expected);
        changed = true;
      }
      previous = node;
    }
  }

  // The first node from `start` on that this render placed (skipping other
  // layers' nodes).
  function nextRendered(start, rendered) {
    for (var walk = start; walk; walk = walk.nextSibling) {
      if (rendered.has(walk)) return walk;
    }
    return null;
  }

  // Brings one live node from `before` to `after`; returns the live node
  // (a new one when it can't be patched).
  function patchNode(before, after, live) {
    if (before.isEqualNode(after)) {
      // Unchanged: keep the old rendered node in the new tree, so it stays
      // paired with its live node and its whole subtree is skipped.
      after.parentNode.replaceChild(before, after);
      return live;
    }
    if (after.nodeType === 3 || after.nodeType === 8) {
      if (live.nodeValue !== after.nodeValue) live.nodeValue = after.nodeValue;
      liveOf.set(after, live);
      changed = true;
      return live;
    }
    if (after.nodeType !== 1 || before.tagName !== after.tagName) {
      var replacement = fresh(after);
      if (live.parentNode) live.parentNode.replaceChild(replacement, live);
      return replacement;
    }
    liveOf.set(after, live);
    patchAttributes(before, after, live);
    patchChildren(before, after, live);
    return live;
  }

  function parse(root, html) {
    var holder = root.cloneNode(false);
    holder.innerHTML = html;
    return holder;
  }

  function rebuild(root, html) {
    root.innerHTML = html;
    var tree = parse(root, html);
    mapTree(tree, root);
    lastTree.set(root, tree);
  }

  // `screen` names what is on screen (the start screen, a run); switching
  // between them rebuilds.
  function update(root, html, screen) {
    var before = lastTree.get(root);
    if (!enabled() || !before || before.__screen !== screen || liveOf.get(before) !== root) {
      rebuild(root, html);
      lastTree.get(root).__screen = screen;
      return;
    }
    var after = parse(root, html);
    after.__screen = screen;
    changed = false;
    liveOf.set(after, root);
    try {
      patchChildren(before, after, root);
    } catch (error) {
      console.warn("Cuddle morph: rebuilding instead.", error);
      rebuild(root, html);
      lastTree.get(root).__screen = screen;
      return;
    }
    lastTree.set(root, after);
    if (changed) {
      // Wake every layer that watches for added/removed nodes.
      var ping = document.createComment("");
      root.appendChild(ping);
      root.removeChild(ping);
    }
  }

  window.CuddleMorph = Object.freeze({ update: update, enabled: enabled });
}());
