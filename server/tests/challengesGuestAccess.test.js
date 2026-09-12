// Regression test for letting single-player Challenges (public/single-
// player/challenges.js, server/single-player/challenges/*) be played
// without an account. Two things had to change together:
//
//  1. The socket handlers (socketHandlers.js) used to require every
//     request to carry a verified Supabase access token. A guest id
//     (see server/utils/guestUsers.js) is now trusted directly, the same
//     way the rest of the app already trusts guests -- but a non-guest id
//     still has to be backed by a real token, so a client can't claim
//     someone else's account by just naming their uuid.
//  2. ChallengeService.startChallenge used to call progressRepository
//     .ensureProfile(userId) unconditionally, which would fail (or write
//     nonsense) for a guest id that has no matching auth.users/profiles
//     row. That call is now skipped for guests -- nothing about a
//     challenge run actually depends on it (star/clear progress lives in
//     the browser's own localStorage, not Supabase).
const assert = require("assert");
const { ChallengeService } = require("../single-player/challenges/challengeService");
const registerChallengeSocketHandlers = require("../single-player/challenges/socketHandlers");

// ---- Part 1: ChallengeService skips ensureProfile for guests -----------

async function testServiceSkipsProfileForGuests() {
  const ensureProfileCalls = [];
  const repo = {
    async ensureProfile(userId) {
      ensureProfileCalls.push(userId);
      return { ok: true, created: false };
    }
  };
  const context = { applyAction: () => {}, io: { to: () => ({ emit: () => {} }) } };
  const service = new ChallengeService({
    context,
    progressRepository: repo,
    sessionService: { sessionsByRoomId: new Map() }
  });

  const result = await service.startChallenge({
    socket: { id: "sock-guest", join: () => {} },
    userId: "guest-abc123",
    userName: "Tester",
    challengeId: "count-only",
    difficultyId: "medium"
  });

  assert.strictEqual(result.ok, true, "a guest should be able to start a challenge");
  assert.deepStrictEqual(ensureProfileCalls, [], "ensureProfile must never be called for a guest id");
}

async function testServiceStillEnsuresProfileForRealAccounts() {
  const ensureProfileCalls = [];
  const repo = {
    async ensureProfile(userId) {
      ensureProfileCalls.push(userId);
      return { ok: true, created: false };
    }
  };
  const context = { applyAction: () => {}, io: { to: () => ({ emit: () => {} }) } };
  const service = new ChallengeService({
    context,
    progressRepository: repo,
    sessionService: { sessionsByRoomId: new Map() }
  });

  const result = await service.startChallenge({
    socket: { id: "sock-real", join: () => {} },
    userId: "11111111-1111-4111-8111-111111111111",
    userName: "Tester",
    challengeId: "count-only",
    difficultyId: "medium"
  });

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(
    ensureProfileCalls,
    ["11111111-1111-4111-8111-111111111111"],
    "a real account should still go through ensureProfile"
  );
}

async function testServiceSurfacesProfileFailureForRealAccounts() {
  const repo = { async ensureProfile() { return { ok: false, code: "CAMPAIGN_STORAGE_UNAVAILABLE" }; } };
  const context = { applyAction: () => {}, io: { to: () => ({ emit: () => {} }) } };
  const service = new ChallengeService({
    context,
    progressRepository: repo,
    sessionService: { sessionsByRoomId: new Map() }
  });

  const result = await service.startChallenge({
    socket: { id: "sock-real2", join: () => {} },
    userId: "real-user-id",
    userName: "Tester",
    challengeId: "count-only",
    difficultyId: "medium"
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "CAMPAIGN_STORAGE_UNAVAILABLE");
}

// ---- Part 2: the socket handlers' guest/real-account auth gate ---------

// Registers the real handler module against fakes and returns the map of
// event name -> registered handler, so each socket.on call can be driven
// directly the way a real "singlePlayer:*" emit would.
function registerFakeHandlers({ supabase, challengeService }) {
  const handlers = {};
  const fakeSocket = {
    id: "sock1",
    on(event, fn) { handlers[event] = fn; }
  };
  const io = { on(event, fn) { if (event === "connection") fn(fakeSocket); } };
  registerChallengeSocketHandlers(io, { supabase }, { challengeService });
  return handlers;
}

function fakeChallengeServiceRecordingUserId() {
  const seenUserIds = [];
  return {
    seenUserIds,
    getCatalog: () => ({ ok: true, challenges: [], difficulties: [] }),
    startChallenge: async ({ userId }) => { seenUserIds.push(userId); return { ok: true, roomId: "ROOM1" }; },
    beginGameplay: async ({ userId }) => { seenUserIds.push(userId); return { ok: true, roomId: "ROOM1" }; },
    abandon: async ({ userId }) => { seenUserIds.push(userId); return { ok: true }; }
  };
}

function emit(handlers, event, payload) {
  return new Promise(resolve => handlers[event](payload, resolve));
}

async function testGuestIdIsTrustedDirectly() {
  const challengeService = fakeChallengeServiceRecordingUserId();
  const handlers = registerFakeHandlers({ supabase: null, challengeService });

  const result = await emit(handlers, "singlePlayer:startChallenge", {
    userId: "guest-xyz",
    challengeId: "count-only",
    difficulty: "medium"
  });

  assert.strictEqual(result.ok, true, "a guest id should be accepted with no token at all");
  assert.deepStrictEqual(challengeService.seenUserIds, ["guest-xyz"]);
}

async function testNonGuestIdWithoutTokenIsRejected() {
  const challengeService = fakeChallengeServiceRecordingUserId();
  const handlers = registerFakeHandlers({ supabase: null, challengeService });

  // A client naming a real-looking id but no accessToken must NOT be
  // trusted -- that would let anyone play (or write progress) as any
  // account id they cared to type in.
  const result = await emit(handlers, "singlePlayer:startChallenge", {
    userId: "someone-elses-real-account-id",
    challengeId: "count-only",
    difficulty: "medium"
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "UNAUTHENTICATED");
  assert.deepStrictEqual(challengeService.seenUserIds, [], "the service must never be called without a resolved id");
}

async function testNonGuestIdWithValidTokenIsVerifiedAndTrusted() {
  const challengeService = fakeChallengeServiceRecordingUserId();
  const supabase = {
    auth: {
      async getUser(token) {
        if (token !== "good-token") return { data: null, error: { message: "bad token" } };
        return { data: { user: { id: "verified-real-id" } }, error: null };
      }
    }
  };
  const handlers = registerFakeHandlers({ supabase, challengeService });

  const result = await emit(handlers, "singlePlayer:startChallenge", {
    accessToken: "good-token",
    challengeId: "count-only",
    difficulty: "medium"
  });

  assert.strictEqual(result.ok, true);
  // The verified id from Supabase is used, not anything the client claimed.
  assert.deepStrictEqual(challengeService.seenUserIds, ["verified-real-id"]);
}

async function testInvalidTokenIsRejected() {
  const challengeService = fakeChallengeServiceRecordingUserId();
  const supabase = { auth: { async getUser() { return { data: null, error: { message: "expired" } }; } } };
  const handlers = registerFakeHandlers({ supabase, challengeService });

  const result = await emit(handlers, "singlePlayer:startChallenge", {
    accessToken: "expired-token",
    challengeId: "count-only",
    difficulty: "medium"
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "UNAUTHENTICATED");
  assert.deepStrictEqual(challengeService.seenUserIds, []);
}

async function testCatalogNeverRequiresAuth() {
  // getChallenges is intentionally not routed through withAuth at all --
  // confirm a request with neither a userId nor an accessToken still gets
  // the catalog.
  const challengeService = fakeChallengeServiceRecordingUserId();
  const handlers = registerFakeHandlers({ supabase: null, challengeService });

  const result = await emit(handlers, "singlePlayer:getChallenges", {});
  assert.strictEqual(result.ok, true);
}

async function run() {
  await testServiceSkipsProfileForGuests();
  await testServiceStillEnsuresProfileForRealAccounts();
  await testServiceSurfacesProfileFailureForRealAccounts();
  await testGuestIdIsTrustedDirectly();
  await testNonGuestIdWithoutTokenIsRejected();
  await testNonGuestIdWithValidTokenIsVerifiedAndTrusted();
  await testInvalidTokenIsRejected();
  await testCatalogNeverRequiresAuth();
}

module.exports = { run };
