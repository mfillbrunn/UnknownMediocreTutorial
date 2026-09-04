// client/guest-identity.js — play without an account.
//
// An account is only needed for the things that genuinely need one: ranked
// play (Elo has to belong to a stable identity), friends, and saved stats
// and match history. Everything else — Quick Play, AI games, the Daily
// Challenge, Cuddle, the tutorials — runs on a guest identity created on
// first visit and kept in localStorage.
//
// The guest identity deliberately fills the same window.currentUser /
// window.myProfile shape the signed-in path uses, so the ~40 call sites
// that already read window.currentUser.id keep working untouched. What
// separates the two is the isGuest flag: use isSignedIn() (not a bare
// window.currentUser truthiness check) anywhere the question is really
// "does this player have an account?".
//
// Guest ids are prefixed "guest-" so the server can recognise them and
// skip Supabase writes keyed on a real profile id (see
// server/utils/guestUsers.js).

const GUEST_STORAGE_KEY = "guestIdentity";
const GUEST_ID_PREFIX = "guest-";

const GUEST_ADJECTIVES = [
  "Curious", "Sly", "Quiet", "Bold", "Clever", "Lucky", "Swift", "Sleepy",
  "Brave", "Cosy", "Nimble", "Sneaky", "Cheerful", "Restless", "Patient",
  "Wandering", "Hidden", "Golden", "Silver", "Midnight", "Autumn", "Wild"
];

const GUEST_NOUNS = [
  "Otter", "Magpie", "Fox", "Heron", "Badger", "Lynx", "Sparrow", "Moth",
  "Beetle", "Wolf", "Raven", "Hare", "Falcon", "Marten", "Owl", "Gull",
  "Pike", "Wren", "Stoat", "Puffin", "Crane", "Ferret"
];

function guestRandomInt(limit) {
  return Math.floor(Math.random() * limit);
}

// Two words plus two digits: short enough to fit the name slots the board
// and summary screens already size for real usernames, but distinct enough
// that two guests in the same room are unlikely to collide.
function randomGuestName() {
  const adjective = GUEST_ADJECTIVES[guestRandomInt(GUEST_ADJECTIVES.length)];
  const noun = GUEST_NOUNS[guestRandomInt(GUEST_NOUNS.length)];
  return `${adjective} ${noun} ${String(guestRandomInt(100)).padStart(2, "0")}`;
}

function randomGuestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${GUEST_ID_PREFIX}${uuid}`;
  // Older browsers (and any context without crypto.randomUUID) still need
  // an id that will not collide across devices sharing this build.
  return `${GUEST_ID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredGuest() {
  let raw = null;
  try {
    raw = localStorage.getItem(GUEST_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.username === "string") {
      return parsed;
    }
  } catch {
    // Corrupt entry: fall through and mint a fresh identity below.
  }
  return null;
}

function writeStoredGuest(identity) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Private-mode/quota failures are survivable: the identity still works
    // for this session, it just will not persist to the next visit.
  }
}

// The same guest keeps their name and id across visits, so an unfinished
// game in My Games (and a Daily attempt) still belongs to them tomorrow.
function ensureGuestIdentity() {
  if (window.guestIdentity) return window.guestIdentity;

  const stored = readStoredGuest();
  const identity = stored || {
    id: randomGuestId(),
    username: randomGuestName(),
    createdAt: new Date().toISOString()
  };

  if (!stored) writeStoredGuest(identity);
  window.guestIdentity = identity;
  return identity;
}

// Installs the guest identity into the same globals the signed-in path
// fills. Never overwrites a real session — callers that run on an auth
// event should check isSignedIn() first, but this guards anyway so an
// out-of-order event can't demote a logged-in player to a guest.
function applyGuestIdentity() {
  if (window.currentUser && !window.currentUser.isGuest) return window.currentUser;

  const identity = ensureGuestIdentity();
  window.currentUser = {
    id: identity.id,
    email: null,
    isGuest: true
  };
  window.myProfile = {
    id: identity.id,
    username: identity.username,
    isGuest: true
  };
  // Guest state is never a Supabase session, so authReady (which gates the
  // rejoin/profile plumbing) has to be set here rather than by an auth
  // event that will not arrive.
  window.authReady = true;
  window.profileReady = true;
  return window.currentUser;
}

// Clears the guest identity from the globals (not from storage) so a real
// login can take over cleanly.
function clearGuestIdentityFromSession() {
  if (window.currentUser?.isGuest) window.currentUser = null;
  if (window.myProfile?.isGuest) window.myProfile = null;
}

// "Has an account", as opposed to "is playing". Anything that reads or
// writes profile-backed data — ranked Elo, friends, saved stats, match
// history — should gate on this rather than on window.currentUser.
function isSignedIn() {
  return !!(window.currentUser && window.currentUser.id && !window.currentUser.isGuest);
}

function isGuestPlayer() {
  return !!window.currentUser?.isGuest;
}

// Gate for the account-only suite. Unlike the old requireAuth (which used
// to sit in front of ordinary play too), this is only for features that
// genuinely cannot work without a profile row behind them.
function requireAccount(featureName = "use this") {
  if (isSignedIn()) return true;
  window.toast?.(`Sign up to ${featureName} — it takes a moment and keeps your stats.`);
  window.showScreen?.("accountScreen");
  return false;
}

// Lets a guest pick a different random name (offered on the account
// screen). Signed-in players rename through their profile instead.
function rerollGuestName() {
  if (!isGuestPlayer()) return null;
  const identity = ensureGuestIdentity();
  identity.username = randomGuestName();
  writeStoredGuest(identity);
  window.guestIdentity = identity;
  if (window.myProfile?.isGuest) window.myProfile.username = identity.username;
  window.renderMenuAccountStatus?.();
  window.updateAccountUI?.();
  return identity.username;
}

window.ensureGuestIdentity = ensureGuestIdentity;
window.applyGuestIdentity = applyGuestIdentity;
window.clearGuestIdentityFromSession = clearGuestIdentityFromSession;
window.isSignedIn = isSignedIn;
window.isGuestPlayer = isGuestPlayer;
window.requireAccount = requireAccount;
window.rerollGuestName = rerollGuestName;

// The account screen's "New name" button, for guests who don't like the one
// they were dealt. Bound on load rather than on screen-open because this
// script runs after the markup it targets is already parsed.
document.getElementById("guestRerollNameBtn")?.addEventListener("click", () => {
  const name = rerollGuestName();
  if (name) window.toast?.(`You're now ${name}`);
});

// Applied immediately (rather than waiting on Supabase's getSession) so the
// very first render, and any click made before auth resolves, already has a
// usable identity to play with. auth.js promotes this to the real user the
// moment it finds a session, and demotes back to guest on sign-out.
applyGuestIdentity();
