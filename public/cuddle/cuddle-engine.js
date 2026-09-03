// public/cuddle/cuddle-engine.js
// Pure client-side rules and persistence for the Cuddle single-player campaign.
(function () {
  "use strict";

  const VERSION = 1;
  const STORAGE_KEY = "vowelPlay.cuddle.v1";
  // Cumulative score gates for twelve SCORING rounds. Boss rounds sit between
  // chapters and are pass/fail, so they neither score nor need their own gate.
  const THRESHOLDS = Object.freeze([25, 55, 85, 120, 160, 200, 220, 285, 350, 380, 450, 520]);
  const MAX_GUESSES = 6;
  const BASE_HAND_SIZE = 5;
  const BASE_MULLIGANS = 2;
  const BASE_MULLIGAN_SIZE = 3;
  const ALWAYS_AVAILABLE_VOWELS = Object.freeze(["A", "E", "I", "O", "U"]);
  const VOWELS = new Set(ALWAYS_AVAILABLE_VOWELS);
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Scoring. Greys are worth nothing (not a penalty), each unused guess on a
  // solve is worth a lot, and mulligans you never spent pay out at round end.
  const YELLOW_POINTS = 1;
  const GREEN_POINTS = 2;
  const EARLY_GUESS_POINTS = 10;
  const UNUSED_MULLIGAN_POINTS = 3;
  // Quests start at zero and are only worth anything once the Quest Value
  // reward (+5 a pick, stacking) or the Quest Head Start boss reward is taken.
  const QUEST_POINTS_PER_PICK = 5;

  // Bosses split twelve scoring rounds into four groups of three: before rounds
  // 4, 7, and 10, followed by a final boss. They are pass/fail and grant
  // only the permanent boss reward shown on the choice card.
  const BOSS_BEFORE_ROUNDS = Object.freeze([4, 7, 10]);

  const DEFAULT_UPGRADES = Object.freeze({
    startingHand: 0,
    extraMulligans: 0,
    mulliganSize: 0,
    yellowPoints: 0,
    earlyRoundPoint: 0,
    questRefreshes: 0,
    questCadence: 0,
    // Added by the Quest Value reward and the Quest Head Start boss reward.
    questPoints: 0,
    // Boss rewards.
    doubleMulligans: 0,
    freeVowelSweep: 0
  });

  function normalizeWords(words) {
    const seen = new Set();
    const normalized = [];
    (words || []).forEach(raw => {
      const word = String(raw || "").trim().toUpperCase();
      if (/^[A-Z]{5}$/.test(word) && !seen.has(word)) {
        seen.add(word);
        normalized.push(word);
      }
    });
    return normalized;
  }

  function shuffle(items, random = Math.random) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function countLetters(text) {
    const counts = Object.create(null);
    String(text || "").split("").forEach(letter => {
      counts[letter] = (counts[letter] || 0) + 1;
    });
    return counts;
  }

  function glyphForLetter(value) {
    const glyph = String(value || "").toUpperCase();
    return glyph === "QU" ? "Q" : glyph;
  }

  function tokensForWord(word) {
    const normalized = String(word || "").toUpperCase();
    return /^[A-Z]+$/.test(normalized) ? normalized.split("") : null;
  }

  function evaluateFeedback(secret, guess) {
    // Reuse the app's universal scorer when it is available; keep a local
    // fallback so the new module remains testable in isolation.
    if (typeof window.scoreGuess === "function") {
      return window.scoreGuess(secret, guess).map(value => (
        value === "🟩" ? "green" : value === "🟨" ? "yellow" : "grey"
      ));
    }
    if (window.CuddleQuestBook?.evaluateFeedback) {
      return window.CuddleQuestBook.evaluateFeedback(secret, guess);
    }
    const result = Array(guess.length).fill("grey");
    const remaining = countLetters(secret);
    for (let i = 0; i < guess.length; i += 1) {
      if (guess[i] === secret[i]) {
        result[i] = "green";
        remaining[guess[i]] -= 1;
      }
    }
    for (let i = 0; i < guess.length; i += 1) {
      if (result[i] === "green") continue;
      if ((remaining[guess[i]] || 0) > 0) {
        result[i] = "yellow";
        remaining[guess[i]] -= 1;
      }
    }
    return result;
  }

  function unique(items) {
    return [...new Set(items)];
  }

  function safeStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  class CuddleGame {
    // wordLists: { guesses, secrets } -- two different pools, same split the
    // main game already uses (server/wordlists/allowed_guesses.txt vs.
    // allowed_secrets.txt, served as /api/allowed-guesses and
    // /api/allowed-secrets). guesses is the broad dictionary a submitted
    // word is checked against; secrets is the curated pool _pickSecret and
    // every "which words are still possible" query (getActiveWords,
    // getFeasibleWords, rare-letter/removal-candidate analysis, the Suggest
    // Guess reward) draws from. Every secrets word is already contained in
    // guesses (verified against the real lists), so a picked secret is
    // always itself a legal submission.
    constructor(wordLists, options = {}) {
      const guesses = normalizeWords(wordLists?.guesses || []);
      const secrets = normalizeWords(wordLists?.secrets || []);
      this.secrets = secrets;
      this.guessSet = new Set(guesses);
      this.secretSet = new Set(secrets);
      this.random = typeof options.random === "function" ? options.random : Math.random;
      this.storage = options.storage === undefined ? safeStorage() : options.storage;
      this.state = null;
      if (this.secrets.length < 12) {
        throw new Error("Cuddle needs at least 12 five-letter secret words.");
      }
      if (!this.guessSet.size) {
        throw new Error("Cuddle needs a non-empty guess word list.");
      }
    }

    static hasSavedRun(storage = safeStorage()) {
      try {
        return Boolean(storage?.getItem(STORAGE_KEY));
      } catch {
        return false;
      }
    }

    static clearSavedRun(storage = safeStorage()) {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Storage is optional; gameplay still works for the current page session.
      }
    }

    static load(wordLists, options = {}) {
      const game = new CuddleGame(wordLists, options);
      let raw = null;
      try {
        raw = game.storage?.getItem(STORAGE_KEY) || null;
      } catch {
        raw = null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION || !parsed.runId) return null;
        game.state = parsed;
        game._hydrateState();
        if (!game._isStateUsable()) return null;
        return game;
      } catch {
        return null;
      }
    }

    _hydrateState() {
      const state = this.state;
      state.upgrades = { ...DEFAULT_UPGRADES, ...(state.upgrades || {}) };
      // The counted hand is now fixed at five. Keep the legacy field so older
      // saves remain readable, but an old starting-hand upgrade has no effect.
      state.upgrades.startingHand = 0;
      const normalizeCards = cards => (Array.isArray(cards) ? cards : [])
        .map(card => (card && typeof card === "object"
          ? { ...card, glyph: glyphForLetter(card.glyph) }
          : null))
        .filter(card => card && /^[A-Z]$/.test(card.glyph));
      state.deck = normalizeCards(state.deck);
      state.discard = normalizeCards(state.discard);
      state.hand = normalizeCards(state.hand);
      state.history = Array.isArray(state.history) ? state.history : [];
      state.draft = [];
      state.usedSecrets = Array.isArray(state.usedSecrets) ? state.usedSecrets : [];
      state.removedLetters = Array.isArray(state.removedLetters) ? state.removedLetters : [];
      state.knownAbsent = Array.isArray(state.knownAbsent) ? state.knownAbsent : [];
      state.knownPresent = Array.isArray(state.knownPresent) ? state.knownPresent : [];
      state.infiniteGlyphs = unique([
        ...ALWAYS_AVAILABLE_VOWELS,
        ...(Array.isArray(state.infiniteGlyphs)
          ? state.infiniteGlyphs.map(glyphForLetter)
          : [])
      ]).sort();
      state.revealedPositions = Array.isArray(state.revealedPositions)
        ? state.revealedPositions.slice(0, 5)
        : Array(5).fill(null);
      while (state.revealedPositions.length < 5) state.revealedPositions.push(null);
      state.questRewardChoices = Array.isArray(state.questRewardChoices) ? state.questRewardChoices : [];
      state.upgradeChoices = Array.isArray(state.upgradeChoices)
        ? state.upgradeChoices.filter(choice => choice?.id !== "startingHand" && choice?.id !== "exchangeReduction")
        : [];
      state.deferredRewards = Array.isArray(state.deferredRewards) ? state.deferredRewards : [];
      state.pendingPositionPeek = Boolean(state.pendingPositionPeek);
      state.buffs = { greyShield: 0, ...(state.buffs || {}) };
      state.serial = Number.isFinite(state.serial) ? state.serial : 0;
      // Short Hand shortens this to 4 for its round -- a save reloaded
      // mid-round used to have this unconditionally reset back to 6 here,
      // silently undoing the boss's guess cap the moment the page reopened.
      state.maxGuesses = Number.isFinite(state.maxGuesses) && state.maxGuesses > 0
        ? state.maxGuesses
        : MAX_GUESSES;
      state.milestonesClaimed = Number.isFinite(state.milestonesClaimed) ? state.milestonesClaimed : 0;
      state.pendingMilestones = Number.isFinite(state.pendingMilestones) ? state.pendingMilestones : 0;
      state.boss = state.boss && typeof state.boss === "object" ? state.boss : null;
      state.bossOffer = Array.isArray(state.bossOffer) ? state.bossOffer : [];
      state.bossesCleared = Number.isFinite(state.bossesCleared) ? state.bossesCleared : 0;
      state.bossesSeen = Array.isArray(state.bossesSeen) ? state.bossesSeen : [];
      state.bossGatesDone = Array.isArray(state.bossGatesDone) ? state.bossGatesDone : [];
      state.lastClearedBossGate = state.lastClearedBossGate || null;
      state.unknownGlyphs = Array.isArray(state.unknownGlyphs) ? state.unknownGlyphs : [];

      // Migrate older saves by removing finite vowel copies, adding one free
      // unlimited card for every vowel, retaining positive unlimited letters,
      // and enforcing five counted consonant slots.
      this._syncInfiniteCards();
      this._trimHandToLimit();
      if (["playing", "questReward"].includes(state.status)
          && this.getCountedHandSize() < this.getHandLimit()) {
        this.drawToHandLimit();
      }
      if (state.status === "upgrade" && state.upgradeChoices.length < 3) {
        state.upgradeChoices = this._generateUpgradeChoices();
      }
      delete state.feedbackBonusMilestones;
    }

    _isStateUsable() {
      const state = this.state;
      if (!state || state.round < 1 || state.round > THRESHOLDS.length) return false;
      if (!this.secretSet.has(state.secret) && !["upgrade", "won", "lost"].includes(state.status)) return false;
      return true;
    }

    save() {
      if (!this.state) return;
      try {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // Ignore quota/privacy errors. The active in-memory run remains playable.
      }
    }

    clearSave() {
      CuddleGame.clearSavedRun(this.storage);
    }

    getSnapshot() {
      return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
    }

    startNew() {
      this.state = {
        version: VERSION,
        runId: `${Date.now()}-${Math.floor(this.random() * 1e9)}`,
        serial: 0,
        status: "playing",
        round: 1,
        score: 0,
        roundScore: 0,
        secret: "",
        usedSecrets: [],
        removedLetters: [],
        deck: [],
        discard: [],
        hand: [],
        draft: [],
        history: [],
        guessesUsed: 0,
        maxGuesses: MAX_GUESSES,
        mulligansLeft: BASE_MULLIGANS,
        knownAbsent: [],
        knownPresent: [],
        infiniteGlyphs: [...ALWAYS_AVAILABLE_VOWELS],
        revealedPositions: Array(5).fill(null),
        activeQuest: null,
        questRewardChoices: [],
        questRewardRefreshesLeft: 0,
        pendingRoundEnd: null,
        boss: null,
        bossOffer: [],
        bossesCleared: 0,
        bossesSeen: [],
        bossGatesDone: [],
        lastClearedBossGate: null,
        unknownGlyphs: [],
        upgradeChoices: [],
        upgradePhase: null,
        upgradeMilestone: null,
        pendingMilestones: 0,
        milestonesClaimed: 0,
        deferredRewards: [],
        pendingPositionPeek: false,
        upgrades: { ...DEFAULT_UPGRADES },
        buffs: { greyShield: 0 },
        lastMessage: "Welcome to Cuddle. Build a five-letter word from your hand.",
        lastRoundSummary: null,
        suggestedWord: null,
        failureReason: null
      };
      this._beginRound();
      this.save();
      return this.getSnapshot();
    }

    getTarget(round = this.state?.round || 1) {
      return THRESHOLDS[Math.max(0, Math.min(THRESHOLDS.length - 1, round - 1))];
    }

    getRulesSummary() {
      return {
        handSize: BASE_HAND_SIZE,
        freeVowels: ALWAYS_AVAILABLE_VOWELS.length,
        mulligans: this.getMulliganAllowance(),
        mulliganSize: this.getMulliganLimit(),
        yellowPoints: YELLOW_POINTS + this.state.upgrades.yellowPoints,
        greenPoints: GREEN_POINTS + this.state.upgrades.yellowPoints,
        earlyPoint: EARLY_GUESS_POINTS + this.state.upgrades.earlyRoundPoint,
        mulliganPoints: UNUSED_MULLIGAN_POINTS,
        questPoints: Number(this.state.upgrades.questPoints) || 0,
        questCadence: Math.max(1, 3 - this.state.upgrades.questCadence),
        questRefreshes: this.state.upgrades.questRefreshes
      };
    }

    // --- Boss rounds -------------------------------------------------------

    // How many mulligans a round starts with. Double Mulligans (a boss
    // reward) doubles whatever the base plus per-round upgrades come to.
    getMulliganAllowance() {
      const base = BASE_MULLIGANS + (Number(this.state?.upgrades?.extraMulligans) || 0);
      const doubles = Number(this.state?.upgrades?.doubleMulligans) || 0;
      return doubles > 0 ? base * 2 : base;
    }

    isBossRound() {
      return Boolean(this.state?.boss);
    }

    // The boss that gates entry to `round`, if any. Bosses sit before the
    // rounds in BOSS_BEFORE_ROUNDS, and one final boss follows the last
    // scoring round.
    _bossGateFor(round) {
      if (BOSS_BEFORE_ROUNDS.includes(round)) return `before-${round}`;
      if (round > THRESHOLDS.length) return "final";
      return null;
    }

    // True while the constraint of the active boss is still in force. Bosses
    // that run the whole round (hideFeedback, quickMode) always return true.
    _bossActive() {
      const boss = this.state?.boss;
      if (!boss) return false;
      // Short Hand's constraint (fewer letters, fewer guesses) isn't a
      // guess-window feedback mask like the other bosses -- it applies for
      // the whole round, so it never "lifts" partway through the way a
      // `turns`-scoped constraint does.
      if (boss.id === "shortHand") return true;
      const turns = Number(boss.turns) || 0;
      return this.state.guessesUsed < turns;
    }

    // The real guess cap for the CURRENT round -- ordinarily just
    // MAX_GUESSES, but Short Hand shortens it to four. Centralized so every
    // "out of guesses" check agrees with what the board actually shows
    // (state.maxGuesses), instead of some checks quietly assuming six.
    _effectiveMaxGuesses() {
      const value = Number(this.state?.maxGuesses);
      return Number.isFinite(value) && value > 0 ? value : MAX_GUESSES;
    }

    // Turns the true feedback into what the board is allowed to show, plus
    // what the player is allowed to LEARN from it. Anything masked reads as
    // "unknown" and teaches nothing -- otherwise the hand cards would quietly
    // reveal exactly what the board is hiding.
    _applyBossFeedback(word, feedback) {
      const boss = this.state.boss;
      if (!boss || !this._bossActive()) {
        return { shown: feedback.slice(), learn: feedback.slice(), counts: null };
      }

      const unknown = () => feedback.map(() => "unknown");

      switch (boss.id) {
        case "countOnly":
          // You learn the totals, never the positions.
          return {
            shown: unknown(),
            learn: unknown(),
            counts: {
              green: feedback.filter(result => result === "green").length,
              yellow: feedback.filter(result => result === "yellow").length
            }
          };

        case "delayedFeedback":
          // Withheld now, released all at once when the delay expires.
          return { shown: unknown(), learn: unknown(), counts: null, deferred: true };

        case "hideFeedback": {
          // Exactly one position stays masked for the entire round.
          const index = Number(boss.hiddenIndex);
          const shown = feedback.slice();
          const learn = feedback.slice();
          if (Number.isInteger(index) && index >= 0 && index < shown.length) {
            shown[index] = "unknown";
            learn[index] = "unknown";
          }
          return { shown, learn, counts: null };
        }

        case "blueMode": {
          // Green and yellow are indistinguishable: you learn the letter is
          // in the secret, but not whether it is in the right place, so the
          // position is never confirmed.
          const shown = feedback.map(result => (result === "grey" ? "grey" : "blue"));
          const learn = feedback.map(result => (result === "grey" ? "grey" : "yellow"));
          return { shown, learn, counts: null };
        }

        case "fakeFeedback": {
          // Reuses the multiplayer Falsify Intel idea: the colours lie, so
          // nothing seen here can be trusted or learned from. Picking
          // independently of the truth (the old behaviour) let a "lie" land
          // on the real colour by chance about a third of the time -- pick
          // only from the two colours that are NOT the true one instead, so
          // it is always actually wrong.
          const shown = feedback.map(trueResult => {
            const options = ["green", "yellow", "grey"].filter(colour => colour !== trueResult);
            return options[Math.floor(this.random() * options.length)];
          });
          return { shown, learn: unknown(), counts: null, fake: true };
        }

        default:
          return { shown: feedback.slice(), learn: feedback.slice(), counts: null };
      }
    }

    // Letters played into a masked guess go to the "unknown pile": still
    // usable, but drawn with a question mark because their real status is
    // being withheld.
    _markUnknownGlyphs(word) {
      const unknown = new Set(this.state.unknownGlyphs || []);
      word.split("").forEach(letter => unknown.add(glyphForLetter(letter)));
      this.state.unknownGlyphs = [...unknown].sort();
    }

    // Delayed Feedback pays out everything it withheld the moment the delay
    // expires: past rows stop being "unknown" and their real colours land.
    _releaseDeferredFeedback() {
      let released = 0;
      this.state.history.forEach(entry => {
        if (!entry?.deferred) return;
        entry.deferred = false;
        entry.shownFeedback = entry.feedback.slice();
        this._updateKnowledge(entry.word, entry.feedback);
        released += 1;
      });
      if (released) this.state.unknownGlyphs = [];
      return released;
    }

    isGlyphUnknown(glyph) {
      return (this.state?.unknownGlyphs || []).includes(glyphForLetter(glyph));
    }

    _nextId(prefix = "card") {
      this.state.serial += 1;
      return `${prefix}-${this.state.serial}`;
    }

    _newCard(glyph, source = "deck") {
      return { id: this._nextId(source), glyph, source };
    }

    getHandLimit() {
      return BASE_HAND_SIZE;
    }

    isVowelGlyph(glyph) {
      return VOWELS.has(String(glyph || ""));
    }

    cardCountsTowardHandLimit(card) {
      if (!card || this.isVowelGlyph(card.glyph)) return false;
      // Extra Letters cards are a deliberate one-turn bonus on top of the
      // counted hand -- counting them would just push other cards out.
      if (card.source === "extra") return false;
      // A glyph confirmed green or yellow is converted to a single permanent
      // "infinite" card by _syncInfiniteCards -- reuse that same flag here
      // instead of recomputing status, so this always agrees with the
      // reuse/discard logic (isInfiniteCard, toggleDraft, _discardCards)
      // no matter how many times the letter gets played in a guess.
      if (this.isInfiniteCard(card)) return false;
      const status = this.getCardKnowledgeStatus(card.glyph);
      return status !== "green" && status !== "yellow";
    }

    getCountedHandSize() {
      return (this.state?.hand || []).filter(card => this.cardCountsTowardHandLimit(card)).length;
    }

    isInfiniteGlyph(glyph) {
      return this.isVowelGlyph(glyph) || (
        Array.isArray(this.state?.infiniteGlyphs)
        && this.state.infiniteGlyphs.includes(glyph)
      );
    }

    isInfiniteCard(card) {
      return Boolean(card && card.source === "infinite");
    }

    _baseDeckGlyphs() {
      const removed = new Set(this.state.removedLetters);
      const glyphs = [];
      LETTERS.forEach(letter => {
        if (!VOWELS.has(letter) && !removed.has(letter)) glyphs.push(glyphForLetter(letter));
      });
      return glyphs;
    }

    _isVowelCard(cardOrGlyph) {
      const glyph = typeof cardOrGlyph === "string" ? cardOrGlyph : cardOrGlyph?.glyph;
      return this.isVowelGlyph(glyph);
    }

    _prepareInitialHand() {
      const cards = shuffle(this._baseDeckGlyphs(), this.random)
        .map(glyph => this._newCard(glyph, "deck"));
      const handSize = Math.min(this.getHandLimit(), cards.length);
      this.state.infiniteGlyphs = [...ALWAYS_AVAILABLE_VOWELS];
      this.state.hand = cards.slice(0, handSize);
      this.state.deck = cards.slice(handSize);
      this.state.discard = [];
      this._syncInfiniteCards();
    }

    _beginRound() {
      const state = this.state;
      state.status = "playing";
      state.roundScore = 0;
      state.secret = this._pickSecret();
      state.usedSecrets.push(state.secret);
      state.history = [];
      state.guessesUsed = 0;
      state.mulligansLeft = this.getMulliganAllowance();
      state.knownAbsent = [];
      state.knownPresent = [];
      state.unknownGlyphs = [];
      state.infiniteGlyphs = [...ALWAYS_AVAILABLE_VOWELS];
      state.revealedPositions = Array(5).fill(null);
      state.activeQuest = null;
      state.questRewardChoices = [];
      state.questRewardRefreshesLeft = 0;
      state.pendingRoundEnd = null;
      state.upgradeChoices = [];
      state.upgradePhase = null;
      state.upgradeMilestone = null;
      state.draft = [];
      state.failureReason = null;
      state.suggestedWord = null;

      // Short Hand: ten random consonants (the secret's own letters are
      // always protected, or the round would be unwinnable) are pulled from
      // the deck for THIS round only, and the round itself ends after four
      // guesses instead of six. Reuses the same removedLetters gate Deep
      // Cull relies on, so canSubmit()/_baseDeckGlyphs() already treat these
      // exactly like a permanent removal for as long as they're in the set.
      state.maxGuesses = MAX_GUESSES;
      if (state.boss?.id === "shortHand") {
        const secretLetters = new Set(state.secret.split(""));
        const alreadyRemoved = new Set(state.removedLetters);
        const candidates = shuffle(
          LETTERS.filter(letter => (
            !VOWELS.has(letter) && !secretLetters.has(letter) && !alreadyRemoved.has(letter)
          )),
          this.random
        );
        const picked = candidates.slice(0, 10);
        state.boss.tempRemovedLetters = picked;
        state.removedLetters = unique([...state.removedLetters, ...picked]).sort();
        state.maxGuesses = 4;
      }

      this._prepareInitialHand();

      const deferred = state.deferredRewards.slice();
      state.deferredRewards = [];
      const messages = [];
      deferred.forEach(rewardId => {
        const message = this._applyRewardEffect(rewardId);
        if (message) messages.push(message);
      });

      // Position Peek, banked at Short Hand's boss-clear (see _clearBoss):
      // applying it right there would read the secret that was JUST solved
      // to beat the boss, where every position is already known -- worthless.
      // NOTE this deliberately does NOT reuse state.deferredRewards -- the
      // singleplayer rework (UMT_CUDDLE_SINGLEPLAYER_V2 below) repurposed
      // "rewards apply immediately" and now aggressively clears that array
      // on every hydrate/beginRound/chooseQuestReward specifically to
      // guarantee nothing is ever silently banked across a round boundary,
      // so anything pushed there before this point never survives to here.
      if (state.pendingPositionPeek) {
        state.pendingPositionPeek = false;
        const message = this._revealPositionPeek();
        if (message) messages.push(message);
      }

      // Free Vowel Sweep (boss reward): one random vowel is tested in every
      // position for free before the first guess, so its greens and greys are
      // already on the board without costing a turn.
      const sweep = this._applyFreeVowelSweep();

      state.lastMessage = messages.length
        ? `Banked quest rewards activated: ${messages.join(" ")}`
        : this.isBossRound()
          ? `Boss round: ${state.boss.title}. Beat it to continue -- no score needed.`
          : `Round ${state.round}: reach ${this.getTarget()} total points and solve the fixed secret.`;
      if (sweep) state.lastMessage += ` ${sweep}`;
      this._ensureQuestForNextGuess();
    }

    // Free Vowel Sweep: pick a vowel and reveal, for free, exactly where it
    // sits in the secret (green) or that it is absent -- without spending a
    // guess and without creating a history row that could end the round.
    _applyFreeVowelSweep() {
      if (!(Number(this.state.upgrades.freeVowelSweep) > 0)) return "";
      const pool = ALWAYS_AVAILABLE_VOWELS.filter(
        vowel => !this.state.removedLetters.includes(vowel)
      );
      if (!pool.length) return "";
      const vowel = pool[Math.floor(this.random() * pool.length)];
      const secret = String(this.state.secret || "");
      const hits = [];
      secret.split("").forEach((letter, index) => {
        if (letter !== vowel) return;
        hits.push(index + 1);
        this.state.revealedPositions[index] = vowel;
      });
      if (hits.length) {
        this.state.knownPresent = unique([...this.state.knownPresent, vowel]).sort();
        this.state.knownAbsent = this.state.knownAbsent.filter(letter => letter !== vowel);
      } else {
        this.state.knownAbsent = unique([...this.state.knownAbsent, vowel]).sort();
      }
      this._syncInfiniteCards();
      return hits.length
        ? `Free vowel sweep: ${vowel} is green at position${hits.length === 1 ? "" : "s"} ${hits.join(", ")}.`
        : `Free vowel sweep: ${vowel} is not in the secret.`;
    }

    _pickSecret() {
      const active = this.getActiveWords();
      if (!active.length) throw new Error("No Cuddle secrets remain after letter removals.");
      const used = new Set(this.state.usedSecrets);
      const unused = active.filter(word => !used.has(word));
      const pool = unused.length ? unused : active;
      return pool[Math.floor(this.random() * pool.length)];
    }

    getActiveWords() {
      const removed = new Set(this.state?.removedLetters || []);
      if (!removed.size) return this.secrets.slice();
      return this.secrets.filter(word => ![...removed].some(letter => word.includes(letter)));
    }

    getHandCard(cardId) {
      return this.state.hand.find(card => card.id === cardId) || null;
    }

    getDraftCards() {
      return this.state.draft.map(id => this.getHandCard(id)).filter(Boolean);
    }

    getDraftWord() {
      return this.getDraftCards().map(card => card.glyph).join("");
    }

    getDraftLetters() {
      return this.getDraftWord().split("");
    }

    toggleDraft(cardId) {
      if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
      const card = this.getHandCard(cardId);
      if (!card) return { ok: false, error: "That card is no longer in your hand." };
      const index = this.state.draft.indexOf(cardId);
      if (!this.isInfiniteCard(card) && index >= 0) {
        this.state.draft.splice(index, 1);
        this.save();
        return { ok: true };
      }
      if (this.getDraftWord().length + card.glyph.length > 5) {
        return { ok: false, error: "That card would take the word past five letters." };
      }
      // Green and yellow cards can be selected repeatedly because their single
      // hand slot represents an unlimited supply for the rest of the round.
      this.state.draft.push(cardId);
      this.save();
      return { ok: true };
    }

    removeDraftAt(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.state.draft.length) {
        return { ok: false, error: "That drafted card is no longer available." };
      }
      this.state.draft.splice(index, 1);
      this.save();
      return { ok: true };
    }

    backspaceDraft() {
      if (!this.state.draft.length) return { ok: false, error: "The current word is already empty." };
      this.state.draft.pop();
      this.save();
      return { ok: true };
    }

    clearDraft() {
      this.state.draft = [];
      this.save();
    }

    canSubmit() {
      const word = this.getDraftWord();
      if (word.length !== 5) return { ok: false, error: "Build exactly five letters." };
      // Silly Word lifts the dictionary requirement for one submission.
      if (!this.guessSet.has(word) && !(Number(this.state.buffs?.sillyWord) > 0)) {
        return { ok: false, error: `${word} is not in the guess word list.` };
      }
      if (this.state.removedLetters.some(letter => word.includes(letter))) {
        return { ok: false, error: "That word contains a letter removed from this run." };
      }
      return { ok: true, word };
    }

    // True when the current draft, if submitted right now, would satisfy the
    // active quest -- lets the UI light the quest card up before the guess
    // is actually locked in.
    wouldDraftCompleteQuest() {
      const quest = this.state.activeQuest;
      if (!quest) return false;
      const word = this.getDraftWord();
      if (word.length !== 5) return false;
      const feedback = evaluateFeedback(this.state.secret, word);
      const requiredLetters = [];
      this.state.history.forEach(previous => {
        previous.word.split("").forEach((letter, index) => {
          if (previous.feedback[index] !== "grey") requiredLetters.push(letter);
        });
      });
      return Boolean(window.CuddleQuestBook?.evaluateQuest(quest, {
        word,
        feedback,
        history: this.state.history,
        knownAbsent: this.state.knownAbsent,
        knownPresent: this.state.knownPresent,
        revealedPositions: this.state.revealedPositions,
        requiredLetters,
        rareLetters: quest.rareLetters || []
      }));
    }

    _drawOne() {
      if (this.getCountedHandSize() >= this.getHandLimit()) return null;
      while (true) {
        if (!this.state.deck.length && this.state.discard.length) {
          this.state.deck = shuffle(this.state.discard, this.random);
          this.state.discard = [];
        }
        const card = this.state.deck.pop();
        if (!card) return null;
        // Vowels and discovered positive glyphs are represented by their one
        // unlimited card, never by a finite draw-pile copy.
        if (this.isInfiniteGlyph(card.glyph)) continue;
        // A letter confirmed absent this round is dead weight -- drop it
        // instead of drawing it back into the hand.
        if (this.state.knownAbsent.includes(card.glyph)) continue;
        this.state.hand.push(card);
        return card;
      }
    }

    drawCards(count) {
      const drawn = [];
      for (let i = 0; i < count && this.getCountedHandSize() < this.getHandLimit(); i += 1) {
        const card = this._drawOne();
        if (!card) break;
        drawn.push(card);
      }
      return drawn;
    }

    drawToHandLimit() {
      return this.drawCards(Math.max(0, this.getHandLimit() - this.getCountedHandSize()));
    }

    _makeRoomForRewardCard() {
      if (this.getCountedHandSize() < this.getHandLimit()) return true;
      const candidates = this.state.hand.filter(card => (
        this.cardCountsTowardHandLimit(card)
        && !this.isInfiniteCard(card)
        && !this.state.draft.includes(card.id)
      ));
      if (!candidates.length) return false;
      const victim = candidates[Math.floor(this.random() * candidates.length)];
      this._discardCards([victim.id]);
      return true;
    }

    _addBonusCard(letterOrGlyph) {
      const glyph = glyphForLetter(letterOrGlyph);
      if (this.isInfiniteGlyph(glyph)) return null;
      if (!this._makeRoomForRewardCard()) return null;
      const card = this._newCard(glyph, "reward");
      this.state.hand.push(card);
      return card;
    }

    _drawRewardCards(count) {
      const drawn = [];
      for (let index = 0; index < count; index += 1) {
        if (!this._makeRoomForRewardCard()) break;
        const card = this._drawOne();
        if (!card) break;
        drawn.push(card);
      }
      return drawn;
    }

    _discardCards(cardIds) {
      const ids = new Set(cardIds);
      const removed = [];
      this.state.hand = this.state.hand.filter(card => {
        if (!ids.has(card.id) || this.isInfiniteCard(card)) return true;
        removed.push(card);
        if (card.source === "deck") this.state.discard.push(card);
        return false;
      });
      this.state.draft = this.state.draft.filter(id => !ids.has(id));
      return removed;
    }

    _updateKnowledge(word, feedback) {
      const statusesByLetter = Object.create(null);
      word.split("").forEach((letter, index) => {
        // "unknown" is a boss mask, not a result -- it must teach nothing, or
        // the hand would reveal what the board is deliberately hiding.
        if (feedback[index] === "unknown") return;
        (statusesByLetter[letter] ||= []).push(feedback[index]);
        if (feedback[index] === "green") this.state.revealedPositions[index] = letter;
      });
      const absent = new Set(this.state.knownAbsent);
      const present = new Set(this.state.knownPresent);
      Object.entries(statusesByLetter).forEach(([letter, statuses]) => {
        if (statuses.some(status => status !== "grey")) {
          present.add(letter);
          absent.delete(letter);
        } else if (!present.has(letter)) {
          absent.add(letter);
        }
      });
      this.state.knownAbsent = [...absent].sort();
      this.state.knownPresent = [...present].sort();
    }

    _trimHandToLimit() {
      while (this.getCountedHandSize() > this.getHandLimit()) {
        let removableIndex = -1;
        for (let index = this.state.hand.length - 1; index >= 0; index -= 1) {
          const card = this.state.hand[index];
          if (this.cardCountsTowardHandLimit(card)
              && !this.isInfiniteCard(card)
              && !this.state.draft.includes(card.id)) {
            removableIndex = index;
            break;
          }
        }
        if (removableIndex < 0) break;
        const [card] = this.state.hand.splice(removableIndex, 1);
        if (card.source === "deck") this.state.discard.push(card);
      }
    }

    _syncInfiniteCards() {
      const previous = new Set([
        ...ALWAYS_AVAILABLE_VOWELS,
        ...(Array.isArray(this.state.infiniteGlyphs) ? this.state.infiniteGlyphs : [])
      ]);
      const activeGlyphs = new Set([...ALWAYS_AVAILABLE_VOWELS, ...this._baseDeckGlyphs()]);
      const unlocked = new Set(ALWAYS_AVAILABLE_VOWELS);
      previous.forEach(glyph => {
        if (activeGlyphs.has(glyph)) unlocked.add(glyph);
      });
      activeGlyphs.forEach(glyph => {
        const status = this.getCardKnowledgeStatus(glyph);
        if (status === "yellow" || status === "green") unlocked.add(glyph);
      });

      const isUnlockedCard = card => Boolean(card && unlocked.has(card.glyph));
      this.state.deck = this.state.deck.filter(card => !isUnlockedCard(card));
      this.state.discard = this.state.discard.filter(card => !isUnlockedCard(card));
      this.state.hand = this.state.hand.filter(card => (
        card && card.glyph && card.source !== "infinite" && !unlocked.has(card.glyph)
      ));
      this.state.infiniteGlyphs = [...unlocked].sort();
      this.state.infiniteGlyphs.forEach(glyph => {
        this.state.hand.push({ id: `infinite-${glyph}`, glyph, source: "infinite" });
      });
      this._trimHandToLimit();
      return this.state.infiniteGlyphs.filter(glyph => !previous.has(glyph));
    }

    submitDraft() {
      const validation = this.canSubmit();
      if (!validation.ok) return validation;
      if (this.state.guessesUsed >= this._effectiveMaxGuesses()) return { ok: false, error: "No guesses remain." };

      const word = validation.word;
      const feedback = evaluateFeedback(this.state.secret, word);
      const yellowCount = feedback.filter(result => result === "yellow").length;
      const greenCount = feedback.filter(result => result === "green").length;
      const greyCount = feedback.filter(result => result === "grey").length;
      const shielded = this.state.buffs.greyShield > 0;
      // Permanent upgrades can change all three tile values. Boss rounds
      // stay pass/fail, so no tile scores there.
      const scoringUpgrades = this.state.upgrades || {};
      const colourBonus = Number(scoringUpgrades.yellowPoints) || 0;
      const greyValue = Number(scoringUpgrades.greyPoints) || 0;
      const coloursDisabled = Number(scoringUpgrades.zeroColourPoints) > 0;
      const yellowValue = coloursDisabled ? 0 : YELLOW_POINTS + colourBonus;
      const greenValue = coloursDisabled ? 0 : GREEN_POINTS + colourBonus;
      const scoreDelta = this.isBossRound()
        ? 0
        : greyCount * greyValue + yellowCount * yellowValue + greenCount * greenValue;
      if (shielded) this.state.buffs.greyShield -= 1;

      const activeQuest = this.state.activeQuest;
      // Capture clue knowledge before this guess updates it. Otherwise a grey
      // in the submitted word would incorrectly make the hard-mode quest fail
      // against the very guess currently being evaluated.
      const questKnowledge = {
        knownAbsent: Array.isArray(this.state.knownAbsent) ? this.state.knownAbsent.slice() : [],
        knownPresent: Array.isArray(this.state.knownPresent) ? this.state.knownPresent.slice() : [],
        revealedPositions: Array.isArray(this.state.revealedPositions)
          ? this.state.revealedPositions.slice()
          : Array(5).fill(null)
      };
      const draftIds = unique(this.state.draft);
      const draftCards = this.getDraftCards();
      this._discardCards(draftIds);
      this.state.draft = [];

      // Both of these are explicitly "this turn only", so they expire on the
      // submission that used them rather than lingering into the next guess.
      if (Number(this.state.buffs?.sillyWord) > 0) this.state.buffs.sillyWord = 0;
      this.state.hand = this.state.hand.filter(card => card.source !== "extra");

      // Boss constraints sit between the true feedback and both what the
      // board shows and what the player is allowed to learn from it.
      // Captured before guessesUsed increments below, so it reflects
      // whether the constraint applied to THIS guess specifically.
      const bossActiveThisGuess = this._bossActive();
      const masked = this._applyBossFeedback(word, feedback);
      if (masked.shown.some(result => result === "unknown")) this._markUnknownGlyphs(word);
      this._updateKnowledge(word, masked.learn);
      const infiniteUnlocked = this._syncInfiniteCards();
      // A finite consonant leaves once if it appeared in the submitted word.
      // Positive consonants stay in one counted slot; vowels remain outside the limit.
      const replacements = this.drawToHandLimit();

      this.state.guessesUsed += 1;
      this.state.score += scoreDelta;
      this.state.roundScore += scoreDelta;
      this.state.draft = [];
      this.state.suggestedWord = null;

      const entry = {
        word,
        feedback,
        // What the board is allowed to render. Identical to `feedback` in an
        // ordinary round; a boss can mask, recolour or falsify it.
        shownFeedback: masked.shown,
        bossCounts: masked.counts || null,
        deferred: Boolean(masked.deferred),
        fakeFeedback: Boolean(masked.fake),
        // Whether the active boss's constraint actually applied to this
        // specific guess -- a boss's window can end mid-round, so later
        // guesses in the same boss round are ordinary again.
        bossActive: bossActiveThisGuess,
        scoreDelta,
        yellowCount,
        greenCount,
        greyCount,
        shielded,
        usedCards: draftCards.map(card => card.glyph),
        replacements: replacements.length,
        infiniteUnlocked,
        questId: activeQuest?.id || null,
        questComplete: false,
        earlyBonus: 0
      };

      let questComplete = false;
      if (activeQuest) {
        const requiredLetters = [];
        this.state.history.forEach(previous => {
          previous.word.split("").forEach((letter, index) => {
            if (previous.feedback[index] !== "grey") requiredLetters.push(letter);
          });
        });
        questComplete = Boolean(window.CuddleQuestBook?.evaluateQuest(activeQuest, {
          word,
          feedback,
          history: this.state.history,
          knownAbsent: questKnowledge.knownAbsent,
          knownPresent: questKnowledge.knownPresent,
          revealedPositions: questKnowledge.revealedPositions,
          requiredLetters,
          rareLetters: activeQuest.rareLetters || []
        }));
        entry.questComplete = questComplete;
        // Quests are worth nothing on their own -- the points only exist once
        // Quest Value / Quest Head Start have been taken. Boss rounds never
        // score, so they never pay this out either.
        if (questComplete && !this.isBossRound()) {
          const questBonus = Number(this.state.upgrades.questPoints) || 0;
          if (questBonus > 0) {
            entry.questBonus = questBonus;
            this.state.score += questBonus;
            this.state.roundScore += questBonus;
          }
        }
        this.state.activeQuest = null;
      }

      const solved = word === this.state.secret;
      if (solved) {
        // Unused guesses and unspent mulligans both pay out on a solve. A
        // boss round is pass/fail, so neither is worth anything there.
        const earlyBonus = this.isBossRound()
          ? 0
          : (MAX_GUESSES - this.state.guessesUsed)
              * (EARLY_GUESS_POINTS + this.state.upgrades.earlyRoundPoint);
        const mulliganBonus = this.isBossRound()
          ? 0
          : Math.max(0, Number(this.state.mulligansLeft) || 0)
              * (UNUSED_MULLIGAN_POINTS + (Number(this.state.upgrades.mulliganPointBonus) || 0));
        entry.earlyBonus = earlyBonus;
        entry.mulliganBonus = mulliganBonus;
        this.state.score += earlyBonus + mulliganBonus;
        this.state.roundScore += earlyBonus + mulliganBonus;
        this.state.pendingRoundEnd = {
          type: "solved",
          word,
          secret: this.state.secret,
          earlyBonus,
          mulliganBonus,
          score: this.state.score,
          target: this.getTarget()
        };
      } else if (this.state.guessesUsed >= this._effectiveMaxGuesses()) {
        this.state.pendingRoundEnd = {
          type: "outOfGuesses",
          secret: this.state.secret,
          score: this.state.score,
          target: this.getTarget()
        };
      }
      this.state.history.push(entry);

      // Delayed Feedback: once the delay expires, everything it withheld
      // lands at once and the unknown pile clears.
      if (this.state.boss?.id === "delayedFeedback" && !this._bossActive()) {
        const released = this._releaseDeferredFeedback();
        if (released) {
          this._syncInfiniteCards();
          this.drawToHandLimit();
        }
      }

      const scoreParts = [];
      if (yellowCount) scoreParts.push(`${yellowCount} yellow`);
      if (greenCount) scoreParts.push(`${greenCount} green`);
      if (greyCount) {
        const greyScore = greyCount * greyValue;
        scoreParts.push(`${greyCount} grey${greyCount === 1 ? "" : "s"}: ${greyScore >= 0 ? "+" : ""}${greyScore}`);
      }
      if (entry.infiniteUnlocked.length) scoreParts.push(`${entry.infiniteUnlocked.join(", ")} now stays in hand`);
      if (entry.earlyBonus) scoreParts.push(`+${entry.earlyBonus} early bonus`);
      if (entry.mulliganBonus) scoreParts.push(`+${entry.mulliganBonus} unused mulligans`);
      this.state.lastMessage = `${word}: ${scoreDelta >= 0 ? "+" : ""}${scoreDelta} points${scoreParts.length ? ` (${scoreParts.join(", ")})` : ""}.`;

      if (questComplete) {
        this.state.status = "questReward";
        this.state.questRewardChoices = window.CuddleQuestBook?.rewardChoices(3, this.random) || [];
        this.state.questRewardRefreshesLeft = this.state.upgrades.questRefreshes;
      } else {
        if (activeQuest) this.state.lastMessage += ` Quest missed: ${activeQuest.title}.`;
        if (this.state.pendingRoundEnd) this._resolvePendingRoundEnd();
        else this._ensureQuestForNextGuess();
      }

      this.save();
      return {
        ok: true,
        word,
        feedback,
        scoreDelta,
        earlyBonus: entry.earlyBonus,
        infiniteUnlocked,
        solved,
        questComplete
      };
    }

    getMulliganLimit() {
      return BASE_MULLIGAN_SIZE + this.state.upgrades.mulliganSize;
    }

    mulligan(cardIds) {
      if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
      const ids = unique(cardIds || []);
      if (this.state.mulligansLeft <= 0) return { ok: false, error: "No mulligans remain this round." };
      if (!ids.length || ids.length > this.getMulliganLimit()) {
        return { ok: false, error: `Choose 1–${this.getMulliganLimit()} cards.` };
      }
      if (ids.some(id => this.state.draft.includes(id))) {
        return { ok: false, error: "Return drafted cards before using a mulligan." };
      }
      if (ids.some(id => !this.getHandCard(id))) return { ok: false, error: "One selected card is unavailable." };
      if (ids.some(id => this.isInfiniteCard(this.getHandCard(id)))) {
        return { ok: false, error: "Unlimited cards cannot be mulliganed." };
      }
      this._discardCards(ids);
      const replacements = this.drawCards(ids.length);
      this.state.mulligansLeft -= 1;
      this.state.lastMessage = `Mulligan: replaced ${replacements.length} card${replacements.length === 1 ? "" : "s"}.`;
      this.save();
      return { ok: true, replacements: replacements.length };
    }

    getCardKnowledgeStatus(cardOrGlyph) {
      const glyph = typeof cardOrGlyph === "string" ? cardOrGlyph : cardOrGlyph?.glyph;
      if (!glyph) return "unused";
      const positiveLetter = glyphForLetter(glyph);
      if (this.state.revealedPositions.includes(positiveLetter)) return "green";
      let sawYellow = false;
      for (const entry of this.state.history) {
        for (let index = 0; index < String(entry.word || "").length; index += 1) {
          if (entry.word[index] !== positiveLetter) continue;
          if (entry.feedback?.[index] === "green") return "green";
          if (entry.feedback?.[index] === "yellow") sawYellow = true;
        }
      }
      if (sawYellow || this.state.knownPresent.includes(positiveLetter)) return "yellow";
      const absent = new Set(this.state.knownAbsent);
      if (absent.has(positiveLetter)) return "red";
      return "unused";
    }

    canBuildWord(word, cards = this.state.hand) {
      const tokens = tokensForWord(word);
      if (!tokens) return false;
      const available = Object.create(null);
      const unlimited = new Set();
      cards.forEach(card => {
        if (this.isInfiniteCard(card)) unlimited.add(card.glyph);
        else available[card.glyph] = (available[card.glyph] || 0) + 1;
      });
      return tokens.every(token => {
        if (unlimited.has(token)) return true;
        if ((available[token] || 0) <= 0) return false;
        available[token] -= 1;
        return true;
      });
    }

    getFeasibleWords(limit = 400) {
      const feasible = [];
      const draftSet = new Set(this.state.draft);
      const cards = this.state.hand.filter(card => (
        this.isInfiniteCard(card) || !draftSet.has(card.id)
      ));
      for (const word of this.getActiveWords()) {
        if (this.canBuildWord(word, cards)) feasible.push(word);
        if (feasible.length >= limit) break;
      }
      return feasible;
    }

    getRareLetters(count = 6) {
      const active = this.getActiveWords();
      const frequencies = LETTERS
        .filter(letter => !VOWELS.has(letter) && !this.state.removedLetters.includes(letter))
        .map(letter => ({ letter, count: active.reduce((sum, word) => sum + Number(word.includes(letter)), 0) }))
        .filter(item => item.count > 0)
        .sort((a, b) => a.count - b.count || a.letter.localeCompare(b.letter));
      return frequencies.slice(0, count).map(item => item.letter);
    }

    _ensureQuestForNextGuess() {
      if (this.state.status !== "playing" || this.state.activeQuest) return;
      const nextGuess = this.state.guessesUsed + 1;
      if (nextGuess > this._effectiveMaxGuesses()) return;
      const cadence = Math.max(1, 3 - this.state.upgrades.questCadence);
      // Fires one turn earlier than a plain multiple of cadence would --
      // base cadence 3 now lands on turns 2 and 5 instead of 3 and 6.
      if (nextGuess < cadence - 1 || (nextGuess + 1) % cadence !== 0) return;
      const feasibleWords = this.getFeasibleWords();
      this.state.activeQuest = window.CuddleQuestBook?.createQuest({
        feasibleWords,
        secret: this.state.secret,
        history: this.state.history,
        knownAbsent: this.state.knownAbsent,
        knownPresent: this.state.knownPresent,
        revealedPositions: this.state.revealedPositions,
        rareLetters: this.getRareLetters(),
        random: this.random
      }) || {
        id: "validPlay",
        icon: "🃏",
        title: "Make It Count",
        description: "Submit any valid five-letter word this turn."
      };
    }

    refreshQuestRewards() {
      if (this.state.status !== "questReward") return { ok: false, error: "No quest reward is open." };
      if (this.state.questRewardRefreshesLeft <= 0) return { ok: false, error: "No reward refreshes remain." };
      this.state.questRewardRefreshesLeft -= 1;
      this.state.questRewardChoices = window.CuddleQuestBook?.rewardChoices(3, this.random) || [];
      this.save();
      return { ok: true };
    }

    chooseQuestReward(rewardId) {
      if (this.state.status !== "questReward") return { ok: false, error: "No quest reward is open." };
      if (!this.state.questRewardChoices.some(reward => reward.id === rewardId)) {
        return { ok: false, error: "That reward is not available." };
      }

      let message;
      if (this.state.pendingRoundEnd?.type === "solved"
          && this.state.score >= this.getTarget()
          && this.state.round < THRESHOLDS.length) {
        this.state.deferredRewards.push(rewardId);
        message = "Reward banked for the opening hand of the next round.";
      } else {
        message = this._applyRewardEffect(rewardId);
      }
      this.state.lastMessage = message || "Quest reward applied.";
      this.state.questRewardChoices = [];
      this.state.questRewardRefreshesLeft = 0;

      if (this.state.pendingRoundEnd) this._resolvePendingRoundEnd();
      else {
        this.state.status = "playing";
        this._ensureQuestForNextGuess();
      }
      this.save();
      return { ok: true, message: this.state.lastMessage };
    }

    _hiddenPositions() {
      return this.state.revealedPositions
        .map((letter, index) => (letter ? null : index))
        .filter(index => index !== null);
    }

    // Position Peek's actual effect (reveal one hidden position, promote
    // that letter to reusable) -- shared so it behaves identically whether
    // it fires as a regular banked reward or as Short Hand's deferred boss
    // reward (see _clearBoss/_beginRound: applying it AT boss-clear time
    // would read the just-solved secret, where every position is already
    // revealed by the winning guess itself -- worthless -- so _clearBoss
    // banks it via state.pendingPositionPeek and _beginRound runs it once
    // the next round's fresh secret exists).
    _revealPositionPeek() {
      const hidden = this._hiddenPositions();
      if (!hidden.length) {
        const drawn = this._drawRewardCards(2);
        return `Every position was already known, so you refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}.`;
      }
      const index = hidden[Math.floor(this.random() * hidden.length)];
      const letter = this.state.secret[index];
      this.state.revealedPositions[index] = letter;
      this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
      this._syncInfiniteCards();
      this.drawToHandLimit();
      return `Position ${index + 1} is ${letter}; ${glyphForLetter(letter)} now stays in hand.`;
    }

    _randomHandLetter() {
      if (!this.state.hand.length) return null;
      const card = this.state.hand[Math.floor(this.random() * this.state.hand.length)];
      return glyphForLetter(card.glyph);
    }

    _applyRewardEffect(rewardId) {
      switch (rewardId) {
        case "suggestGuess": {
          const active = this.getActiveWords();
          const handCounts = Object.create(null);
          this.state.hand.forEach(card => {
            handCounts[card.glyph] = this.isInfiniteCard(card)
              ? Infinity
              : (handCounts[card.glyph] || 0) + 1;
          });
          let best = null;
          let bestDeficit = Infinity;
          active.forEach(word => {
            const tokens = tokensForWord(word);
            if (!tokens) return;
            const needs = Object.create(null);
            tokens.forEach(token => { needs[token] = (needs[token] || 0) + 1; });
            const deficit = Object.entries(needs).reduce(
              (sum, [token, count]) => sum + Math.max(0, count - (handCounts[token] || 0)),
              0
            );
            if (deficit < bestDeficit || (deficit === bestDeficit && this.random() < 0.08)) {
              best = { word, tokens, needs };
              bestDeficit = deficit;
            }
          });
          if (!best) return "No suggestion was available.";
          const useful = best.tokens.find(token => (handCounts[token] || 0) < (best.needs[token] || 0))
            || best.tokens.find(token => !this.isInfiniteGlyph(token))
            || best.tokens[0];
          const added = this._addBonusCard(useful);
          this.state.suggestedWord = best.word;
          return added
            ? `Suggestion: ${best.word}. ${useful} replaced one finite hand card.`
            : `Suggestion: ${best.word}. Your reusable hand already covers its useful letters.`;
        }
        case "rouletteSecret": {
          const drawn = this._drawRewardCards(3);
          return `Roulette Draw refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}; the secret stayed fixed.`;
        }
        case "revealHistory": {
          const pool = shuffle(
            this.state.discard.filter(card => !this.isInfiniteGlyph(card.glyph)),
            this.random
          ).slice(0, 2);
          if (!pool.length) {
            const drawn = this._drawRewardCards(2);
            return `No discard was available, so Recover refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}.`;
          }
          const added = pool.map(card => this._addBonusCard(card.glyph)).filter(Boolean);
          return `Recover copied ${added.length ? added.map(card => card.glyph).join(" and ") : "no additional cards"} into the counted hand.`;
        }
        case "stealthGuess":
          this.state.buffs.greyShield += 1;
          return "Stealth Guess armed: the next guess ignores grey penalties.";
        case "revealGreen":
          return this._revealPositionPeek();
        case "nonsense": {
          const glyphs = this._baseDeckGlyphs().filter(glyph => !this.isInfiniteGlyph(glyph));
          const added = [];
          for (let i = 0; i < 2 && glyphs.length; i += 1) {
            const glyph = glyphs[Math.floor(this.random() * glyphs.length)];
            const card = this._addBonusCard(glyph);
            if (card) added.push(card.glyph);
          }
          return `Nonsense replaced finite cards with ${added.length ? added.join(" and ") : "no new letters"}.`;
        }
        case "letterProbe": {
          const letter = this._randomHandLetter();
          if (!letter) return "There was no hand card to probe.";
          const count = this.state.secret.split("").filter(value => value === letter).length;
          if (!count) this.state.knownAbsent = unique([...this.state.knownAbsent, letter]).sort();
          else {
            this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
            this._syncInfiniteCards();
            this.drawToHandLimit();
          }
          return `Probe result: ${letter} appears ${count} time${count === 1 ? "" : "s"} in the secret${count ? " and is now stays in hand" : ""}.`;
        }
        case "revealLocation": {
          const hidden = this._hiddenPositions();
          if (!hidden.length) {
            const drawn = this._drawRewardCards(1);
            return `Every position was already known, so you refreshed ${drawn.length} finite card instead.`;
          }
          const index = hidden[Math.floor(this.random() * hidden.length)];
          const letter = this.state.secret[index];
          this.state.revealedPositions[index] = letter;
          this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
          this._syncInfiniteCards();
          this.drawToHandLimit();
          return `Position ${index + 1} is ${letter}; ${glyphForLetter(letter)} now stays in hand.`;
        }
        case "letterProfile": {
          const letter = this._randomHandLetter();
          if (!letter) return "There was no hand card to profile.";
          const count = this.state.secret.split("").filter(value => value === letter).length;
          if (!count) this.state.knownAbsent = unique([...this.state.knownAbsent, letter]).sort();
          else {
            this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
            this._syncInfiniteCards();
            this.drawToHandLimit();
          }
          return `Profile: ${letter} occurs ${count} time${count === 1 ? "" : "s"}${count ? " and is now stays in hand" : ""}.`;
        }
        default:
          return "Quest reward applied.";
      }
    }

    _resolvePendingRoundEnd() {
      const pending = this.state.pendingRoundEnd;
      if (!pending) return;
      this.state.pendingRoundEnd = null;
      this.state.lastRoundSummary = {
        round: this.state.round,
        secret: pending.secret,
        score: this.state.score,
        roundScore: this.state.roundScore,
        target: this.getTarget(),
        earlyBonus: pending.earlyBonus || 0,
        guesses: this.state.guessesUsed
      };

      if (pending.type === "outOfGuesses") {
        this.state.status = "lost";
        // Boss rounds like Short Hand can shorten the cap below the usual
        // six, so the message has to name the guess count that actually
        // applied this round rather than assuming it was always six.
        const guessLimit = this._effectiveMaxGuesses();
        this.state.failureReason = this.isBossRound()
          ? `The ${this.state.boss.title} boss kept ${pending.secret} hidden for all ${guessLimit} guesses.`
          : `You did not find ${pending.secret} in ${guessLimit} guesses.`;
        return;
      }

      // A boss round is pass/fail: solving it is the whole requirement, and
      // no threshold applies because nothing scored.
      if (this.isBossRound()) {
        this._clearBoss();
        return;
      }

      if (this.state.score < this.getTarget()) {
        this.state.status = "lost";
        this.state.failureReason = `You solved ${pending.secret}, but needed ${this.getTarget()} total points to continue.`;
        return;
      }

      this.state.status = "upgrade";
      this.state.upgradePhase = "round";
      this.state.upgradeMilestone = null;
      this.state.upgradeChoices = this._generateUpgradeChoices();
    }

    // Beating a boss grants its own permanent upgrade on top of the ordinary
    // post-round reward pick. The final boss ends the run instead.
    _clearBoss() {
      const boss = this.state.boss;
      // Short Hand's ten letters were only ever removed "for this round" --
      // put them back now that the round is actually over, without
      // disturbing any permanent removal (e.g. Deep Cull) sitting alongside
      // them in the same list.
      if (boss?.tempRemovedLetters?.length) {
        const temp = new Set(boss.tempRemovedLetters);
        this.state.removedLetters = (this.state.removedLetters || []).filter(letter => !temp.has(letter));
      }
      this.state.boss = null;
      this.state.bossesCleared += 1;
      this.state.unknownGlyphs = [];
      // Marks the gate as resolved so _advanceRound drops into the round it
      // was guarding instead of offering the same boss again.
      this.state.bossGatesDone = unique([...(this.state.bossGatesDone || []), boss?.gate].filter(Boolean));
      this.state.lastClearedBossGate = boss?.gate || null;

      // Position Peek can't do anything useful against the secret that was
      // JUST solved to beat this boss -- bank it instead (via its own flag,
      // NOT state.deferredRewards -- see _beginRound's note on why that
      // array is a dead end here), so it actually fires once the next
      // round's fresh secret exists.
      let rewardMessage;
      if (boss?.rewardId === "revealGreen") {
        this.state.pendingPositionPeek = true;
        rewardMessage = "Position Peek will reveal a letter once your next round begins.";
      } else {
        rewardMessage = this._applyBossReward(boss?.rewardId);
      }

      if (boss?.gate === "final") {
        this.state.status = "won";
        this.state.failureReason = null;
        this.state.lastMessage = `You beat the final boss: ${boss.title}.`;
        return;
      }

      this.state.status = "upgrade";
      this.state.upgradePhase = "round";
      this.state.upgradeMilestone = null;
      this.state.upgradeChoices = this._generateUpgradeChoices();
      this.state.lastMessage = rewardMessage
        ? `${boss?.title || "Boss"} cleared. ${rewardMessage}`
        : `${boss?.title || "Boss"} cleared.`;
    }

    _applyBossReward(rewardId) {
      const reward = window.CuddleQuestBook?.getBossReward?.(rewardId);
      if (!reward) return "";
      switch (rewardId) {
        case "cullRare": {
          const letters = this._removalCandidates(4);
          if (!letters.length) return "No letters were safe to remove.";
          this.state.removedLetters = unique([...this.state.removedLetters, ...letters]).sort();
          return `Deep Cull removed ${letters.join(", ")}.`;
        }
        case "doubleMulligans":
          this.state.upgrades.doubleMulligans += 1;
          return "Mulligans per round are now doubled.";
        case "biggerMulligans":
          // Enough headroom that a mulligan can swap the whole counted hand.
          this.state.upgrades.mulliganSize = Math.max(
            this.state.upgrades.mulliganSize,
            BASE_HAND_SIZE - BASE_MULLIGAN_SIZE
          );
          return "Mulligans now replace up to five cards.";
        case "richerColours":
          this.state.upgrades.yellowPoints += 2;
          return "Yellow and green tiles are worth 2 more points each.";
        case "freeVowelSweep":
          this.state.upgrades.freeVowelSweep += 1;
          return "Each round now opens with a free vowel sweep.";
        // revealGreen (Position Peek) is NOT handled here: applying it at
        // boss-clear time would read the secret that was JUST solved to
        // beat this boss -- every position is already known by then, so
        // it's always worthless. _clearBoss banks it via
        // state.pendingPositionPeek instead, so it actually fires (via
        // _applyRewardEffect, from _beginRound) once the next round's
        // fresh secret exists.
        case "questHead":
          this.state.upgrades.questPoints += 10;
          return "Quests are worth 10 more points.";
        default:
          return "";
      }
    }

    // Offers two bosses before `round`, if that round is gated by one.
    _openBossGate(round) {
      const gate = this._bossGateFor(round);
      if (!gate) return false;
      if ((this.state.bossGatesDone || []).includes(gate)) return false;
      const choices = window.CuddleQuestBook?.bossChoices?.(this.random, this.state.bossesSeen) || [];
      if (choices.length < 2) return false;
      this.state.status = "bossChoice";
      this.state.bossOffer = choices.map(choice => ({ ...choice, gate }));
      return true;
    }

    // Quick Mode: the clock ran out, so the guess is spent without a word.
    // Burns the turn (and ends the round if it was the last one) without
    // scoring or teaching anything.
    forfeitGuess() {
      if (this.state.status !== "playing") return { ok: false, error: "The round is not running." };
      if (this.state.guessesUsed >= this._effectiveMaxGuesses()) return { ok: false, error: "No guesses remain." };

      this.state.draft = [];
      this.state.guessesUsed += 1;
      this.state.history.push({
        word: "",
        feedback: [],
        shownFeedback: [],
        timedOut: true,
        scoreDelta: 0,
        yellowCount: 0,
        greenCount: 0,
        greyCount: 0,
        usedCards: [],
        replacements: 0,
        infiniteUnlocked: [],
        questId: this.state.activeQuest?.id || null,
        questComplete: false,
        earlyBonus: 0
      });
      this.state.activeQuest = null;
      this.state.lastMessage = "Out of time: that guess was lost.";

      if (this.state.guessesUsed >= this._effectiveMaxGuesses()) {
        this.state.pendingRoundEnd = {
          type: "outOfGuesses",
          secret: this.state.secret,
          score: this.state.score,
          target: this.getTarget()
        };
        this._resolvePendingRoundEnd();
      } else {
        this._ensureQuestForNextGuess();
      }
      this.save();
      return { ok: true };
    }

    chooseBoss(bossId) {
      if (this.state.status !== "bossChoice") return { ok: false, error: "No boss choice is open." };
      const chosen = (this.state.bossOffer || []).find(option => option.id === bossId);
      if (!chosen) return { ok: false, error: "That boss is not on offer." };

      this.state.boss = {
        id: chosen.id,
        title: chosen.title,
        icon: chosen.icon,
        description: chosen.description,
        turns: Number(chosen.turns) || MAX_GUESSES,
        rewardId: chosen.rewardId,
        gate: chosen.gate,
        // Hide Feedback picks its masked position once, up front, so it is
        // the same one for the whole round.
        hiddenIndex: chosen.id === "hideFeedback" ? Math.floor(this.random() * 5) : null,
        // Quick Mode is the only boss the UI has to run a clock for.
        secondsPerGuess: chosen.id === "quickMode" ? 60 : null
      };
      this.state.bossesSeen = unique([...(this.state.bossesSeen || []), chosen.id]);
      this.state.bossOffer = [];
      this._beginRound();
      this.save();
      return { ok: true };
    }

    _removalCandidate() {
      const active = this.getActiveWords();
      const used = new Set(this.state.usedSecrets);
      const remainingRounds = THRESHOLDS.length - this.state.round;
      const candidates = LETTERS
        .filter(letter => !VOWELS.has(letter) && !this.state.removedLetters.includes(letter))
        .map(letter => {
          const frequency = active.reduce((sum, word) => sum + Number(word.includes(letter)), 0);
          const future = active.filter(word => !word.includes(letter) && !used.has(word)).length;
          return { letter, frequency, future };
        })
        .filter(item => item.frequency > 0 && item.future >= remainingRounds)
        .sort((a, b) => a.frequency - b.frequency || a.letter.localeCompare(b.letter))
        .slice(0, 10);
      if (!candidates.length) return null;
      return candidates[Math.floor(this.random() * candidates.length)].letter;
    }

    // Picks up to `count` letters for the Cull upgrade, one at a time,
    // simulating each prior pick as already removed before choosing the
    // next -- so the "future" viability check in _removalCandidate always
    // accounts for the combined removal, not just each letter alone.
    _removalCandidates(count) {
      const originalRemoved = this.state.removedLetters;
      const picks = [];
      try {
        for (let i = 0; i < count; i += 1) {
          this.state.removedLetters = [...originalRemoved, ...picks];
          const letter = this._removalCandidate();
          if (!letter) break;
          picks.push(letter);
        }
      } finally {
        this.state.removedLetters = originalRemoved;
      }
      return picks;
    }

    _upgradeCatalog() {
      const choices = [
        {
          id: "extraMulligans",
          icon: "🔄",
          title: "Second Thoughts",
          description: "Gain one additional mulligan each round."
        },
        {
          id: "yellowPoints",
          icon: "🟨",
          title: "Golden Value",
          description: "Every yellow tile is worth one additional point."
        },
        {
          id: "earlyRoundPoint",
          icon: "⏱️",
          title: "Quick Cuddle",
          description: "Each unused guess in the solve bonus is worth one additional point."
        },
        {
          id: "questRefreshes",
          icon: "♻️",
          title: "Reward Refresh",
          description: "Gain one refresh whenever you choose a quest reward."
        },
        {
          id: "questPoints",
          icon: "🏅",
          title: "Quest Value",
          description: "Quests are worth 5 more points. Stacks every time you take it."
        }
      ];
      if (this.state.upgrades.mulliganSize < 2) {
        choices.push({
          id: "mulliganSize",
          icon: "🃏",
          title: "Bigger Mulligan",
          description: "Each mulligan may replace one additional card."
        });
      }
      if (this.state.upgrades.questCadence < 2) {
        const nextCadence = Math.max(1, 2 - this.state.upgrades.questCadence);
        choices.push({
          id: "questCadence",
          icon: "❗",
          title: nextCadence === 1 ? "Quest Every Turn" : "Quests Sooner",
          description: nextCadence === 1
            ? "A quest appears on every guess. This is the final cadence upgrade."
            : "A quest appears every two guesses instead of every three."
        });
      }
      const letters = this._removalCandidates(2);
      if (letters.length) {
        const list = letters.join(" & ");
        const verb = letters.length > 1 ? "They were" : "It was";
        choices.push({
          id: "removeLetter",
          key: `removeLetter:${letters.join("")}`,
          letters,
          icon: "✂️",
          title: `Cull ${list}`,
          description: `Remove ${list} from the deck and from every future secret. ${verb} drawn from the ten least-common eligible consonants.`
        });
      }
      return choices.map(choice => ({ ...choice, key: choice.key || choice.id }));
    }

    _generateUpgradeChoices() {
      return shuffle(this._upgradeCatalog(), this.random).slice(0, 3);
    }

    chooseUpgrade(choiceKey) {
      if (this.state.status !== "upgrade") return { ok: false, error: "No upgrade choice is open." };
      const choice = this.state.upgradeChoices.find(item => item.key === choiceKey);
      if (!choice) return { ok: false, error: "That upgrade is not available." };

      switch (choice.id) {
        case "removeLetter":
          this.state.removedLetters = unique([
            ...this.state.removedLetters,
            ...(choice.letters || (choice.letter ? [choice.letter] : []))
          ]).sort();
          break;
        case "extraMulligans":
        case "mulliganSize":
        case "yellowPoints":
        case "earlyRoundPoint":
        case "questRefreshes":
        case "questCadence":
          this.state.upgrades[choice.id] += 1;
          break;
        case "questPoints":
          this.state.upgrades.questPoints += QUEST_POINTS_PER_PICK;
          break;
        default:
          return { ok: false, error: "Unknown upgrade." };
      }
      this.state.lastMessage = `${choice.title} acquired.`;

      // Score milestones are gone -- the extra rewards now come from the boss
      // rounds instead, so every upgrade pick simply advances the run.
      this._advanceRound();
      this.save();
      return { ok: true };
    }

    _advanceRound() {
      // A boss round is an interlude, not a numbered scoring round: clearing
      // the boss that gates round N drops the player into round N itself
      // rather than skipping past it.
      const justClearedGate = this.state.lastClearedBossGate;
      this.state.lastClearedBossGate = null;
      const next = justClearedGate ? this.state.round : this.state.round + 1;

      // Past the last scoring round the only thing left is the final boss.
      if (next > THRESHOLDS.length) {
        if (this._openBossGate(next)) return;
        this.state.status = "won";
        this.state.failureReason = null;
        return;
      }

      this.state.round = next;
      // Bosses gate entry to scoring rounds 4, 7, and 10.
      if (this._openBossGate(next)) return;
      this._beginRound();
    }

    getUpgradeSummary() {
      const rules = this.getRulesSummary();
      const removed = this.state.removedLetters.length ? this.state.removedLetters.join(", ") : "None";
      return [
        `Mulligans: ${rules.mulligans} × up to ${rules.mulliganSize}`,
        `Yellow value: ${rules.yellowPoints}`,
        `Early value: ${rules.earlyPoint} per unused guess`,
        `Quest cadence: every ${rules.questCadence} turn${rules.questCadence === 1 ? "" : "s"}`,
        `Quest refreshes: ${rules.questRefreshes}`,
        `Removed letters: ${removed}`
      ];
    }
  }

  /* UMT_USER_FIX_PACK_V1: ENGINE OVERRIDES START */
  // Every visible hand glyph may be reused while constructing the current word.
  CuddleGame.prototype.toggleDraft = function toggleDraftReusable(cardId) {
    if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
    const card = this.getHandCard(cardId);
    if (!card) return { ok: false, error: "That card is no longer in your hand." };
    if (this.getDraftWord().length + card.glyph.length > 5) {
      return { ok: false, error: "That card would take the word past five letters." };
    }
    this.state.draft.push(cardId);
    this.save();
    return { ok: true };
  };

  CuddleGame.prototype.canBuildWord = function canBuildWordReusable(word, cards = this.state.hand) {
    const tokens = tokensForWord(word);
    if (!tokens) return false;
    const available = new Set((cards || []).map(card => card?.glyph).filter(Boolean));
    return tokens.every(token => available.has(token));
  };

  CuddleGame.prototype.getFeasibleWords = function getFeasibleWordsReusable(limit = 400) {
    const feasible = [];
    for (const word of this.getActiveWords()) {
      if (this.canBuildWord(word, this.state.hand)) feasible.push(word);
      if (feasible.length >= limit) break;
    }
    return feasible;
  };

  // Guided Letter shows a word and nothing else -- it no longer swaps a card
  // into the hand, so the suggestion has to be one the current hand can
  // already build or it would be useless.
  const originalCuddleApplyRewardEffect = CuddleGame.prototype._applyRewardEffect;
  CuddleGame.prototype._applyRewardEffect = function applyReusableLetterReward(rewardId) {
    if (rewardId !== "suggestGuess") {
      return originalCuddleApplyRewardEffect.call(this, rewardId);
    }

    const buildable = this.getFeasibleWords(200);
    if (buildable.length) {
      const word = buildable[Math.floor(this.random() * buildable.length)];
      this.state.suggestedWord = word;
      return `Guided Letter: try ${word}.`;
    }

    // Nothing is currently buildable, so fall back to the closest candidate
    // rather than showing nothing at all.
    const available = new Set(this.state.hand.map(card => card.glyph));
    let best = null;
    let bestDeficit = Infinity;
    this.getActiveWords().forEach(word => {
      const tokens = tokensForWord(word);
      if (!tokens) return;
      const deficit = unique(tokens.filter(token => !available.has(token))).length;
      if (deficit < bestDeficit) {
        best = word;
        bestDeficit = deficit;
      }
    });
    if (!best) return "No suggestion was available.";
    this.state.suggestedWord = best;
    return `Guided Letter: aim for ${best}.`;
  };
  /* UMT_USER_FIX_PACK_V1: ENGINE OVERRIDES END */

  /* UMT_CUDDLE_SINGLEPLAYER_V2: ENGINE START */
  // Single-player Cuddle overrides only. Nothing in the multiplayer server or
  // shared multiplayer state is changed by this block.
  const cuddleV2OriginalHydrateState = CuddleGame.prototype._hydrateState;
  CuddleGame.prototype._hydrateState = function hydrateCuddleV2State() {
    const hadIntroFlag = Boolean(
      this.state && Object.prototype.hasOwnProperty.call(this.state, "roundIntroPending")
    );
    cuddleV2OriginalHydrateState.call(this);
    this.state.deferredRewards = [];
    this.state.buffs = { ...(this.state.buffs || {}), greyShield: 0 };
    if (Array.isArray(this.state.questRewardChoices) && window.CuddleQuestBook?.getReward) {
      this.state.questRewardChoices = this.state.questRewardChoices.map(choice => (
        window.CuddleQuestBook.getReward(choice?.id) || choice
      ));
    }
    this.state.roundIntroPending = hadIntroFlag
      ? Boolean(this.state.roundIntroPending)
      : this.state.status === "playing" && this.state.guessesUsed === 0;
  };

  const cuddleV2OriginalBeginRound = CuddleGame.prototype._beginRound;
  CuddleGame.prototype._beginRound = function beginCuddleV2Round() {
    // Clear old banked rewards before the original round setup can apply them.
    if (this.state) this.state.deferredRewards = [];
    cuddleV2OriginalBeginRound.call(this);
    this.state.deferredRewards = [];
    this.state.buffs = { ...(this.state.buffs || {}), greyShield: 0 };

    // The quest for guess one (when cadence upgrades allow it) is generated
    // only after the player dismisses the round summary.
    this.state.activeQuest = null;
    this.state.roundIntroPending = true;
    // Don't clobber what the base _beginRound already said: a boss round
    // announces its own constraint, the Free Vowel Sweep reward appends the
    // letter it just tested for free, and a banked reward (e.g. Short
    // Hand's Position Peek, applied here once the fresh secret exists --
    // see _beginRound) opens with "Banked quest rewards activated". Only
    // the plain round line is regenerated here.
    const alreadySaid = String(this.state.lastMessage || "");
    if (
      !this.isBossRound() &&
      !alreadySaid.includes("Free vowel sweep") &&
      !alreadySaid.includes("Banked quest rewards activated")
    ) {
      this.state.lastMessage = `Round ${this.state.round}: reach ${this.getTarget()} total points and solve the fixed secret.`;
    }
  };

  CuddleGame.prototype.dismissRoundIntro = function dismissRoundIntro() {
    if (!this.state?.roundIntroPending) {
      return { ok: false, error: "The round summary is not open." };
    }
    this.state.roundIntroPending = false;
    this._ensureQuestForNextGuess();
    this.save();
    return { ok: true };
  };

  CuddleGame.prototype.getCurrentModifications = function getCurrentModifications() {
    const upgrades = this.state?.upgrades || {};
    const modifications = [];
    const extraMulligans = Number(upgrades.extraMulligans || 0);
    const biggerMulligan = Number(upgrades.mulliganSize || 0);
    const strongerYellows = Number(upgrades.yellowPoints || 0);
    const fasterSolve = Number(upgrades.earlyRoundPoint || 0);
    const rewardRefreshes = Number(upgrades.questRefreshes || 0);
    const questCadence = Number(upgrades.questCadence || 0);

    if (extraMulligans) {
      modifications.push(`+${extraMulligans} mulligan${extraMulligans === 1 ? "" : "s"} each round`);
    }
    if (biggerMulligan) {
      modifications.push(`Mulligans replace up to ${BASE_MULLIGAN_SIZE + biggerMulligan} cards`);
    }
    if (strongerYellows) {
      modifications.push(`Yellow and green tiles are worth +${strongerYellows} extra point${strongerYellows === 1 ? "" : "s"}`);
    }
    if (Number(upgrades.questPoints || 0)) {
      modifications.push(`Quests are worth ${Number(upgrades.questPoints)} points`);
    }
    if (Number(upgrades.doubleMulligans || 0)) {
      modifications.push("Mulligans per round are doubled");
    }
    if (Number(upgrades.freeVowelSweep || 0)) {
      modifications.push("Each round opens with a free vowel sweep");
    }
    if (Number(this.state?.bossesCleared || 0)) {
      modifications.push(`Bosses beaten: ${Number(this.state.bossesCleared)}`);
    }
    if (fasterSolve) {
      modifications.push(`Early-solve bonus is +${fasterSolve} extra per unused guess`);
    }
    if (rewardRefreshes) {
      modifications.push(`${rewardRefreshes} quest reward refresh${rewardRefreshes === 1 ? "" : "es"}`);
    }
    if (questCadence) {
      const cadence = Math.max(1, 3 - questCadence);
      modifications.push(`A quest appears every ${cadence} guess${cadence === 1 ? "" : "es"}`);
    }
    if (this.state?.removedLetters?.length) {
      modifications.push(`Removed letters: ${this.state.removedLetters.join(", ")}`);
    }
    return modifications.length
      ? modifications
      : ["No run upgrades yet; base Cuddle rules are active."];
  };

  // The old Stealth Guess reward referred to a grey-score penalty that Cuddle
  // no longer uses. Keep its internal ID for save compatibility, but make the
  // effect meaningful and strictly local to the current round.
  const cuddleV2OriginalRewardEffect = CuddleGame.prototype._applyRewardEffect;
  CuddleGame.prototype._applyRewardEffect = function applyCuddleV2Reward(rewardId) {
    if (rewardId === "stealthGuess") {
      this.state.mulligansLeft = Number(this.state.mulligansLeft || 0) + 1;
      return "Extra Mulligan added for this round.";
    }

    // Letter Count now reports the whole counted hand at once: for each of
    // the five consonants, how many times it appears in the secret.
    if (rewardId === "letterProbe") {
      const secret = String(this.state.secret || "");
      const glyphs = unique(
        this.state.hand
          .filter(card => this.cardCountsTowardHandLimit(card))
          .map(card => glyphForLetter(card.glyph))
      ).sort();
      if (!glyphs.length) return "There were no consonants in hand to count.";
      const parts = glyphs.map(glyph => {
        const count = secret.split("").filter(letter => letter === glyph).length;
        if (count > 0) {
          this.state.knownPresent = unique([...this.state.knownPresent, glyph]).sort();
          this.state.knownAbsent = this.state.knownAbsent.filter(letter => letter !== glyph);
        } else {
          this.state.knownAbsent = unique([...this.state.knownAbsent, glyph]).sort();
        }
        return `${glyph}×${count}`;
      });
      this._syncInfiniteCards();
      this.drawToHandLimit();
      return `Letter Count: ${parts.join(", ")}.`;
    }

    // Silly Word lifts the dictionary check for exactly one submission.
    if (rewardId === "sillyWord") {
      this.state.buffs = { ...(this.state.buffs || {}), sillyWord: 1 };
      return "Silly Word armed: your next guess does not have to be a real word.";
    }

    // Extra Letters adds three consonants ON TOP of the counted hand rather
    // than through the draw pile, which would just displace cards to stay at
    // five. source "extra" keeps them outside the limit (see
    // cardCountsTowardHandLimit) so they genuinely widen this turn.
    if (rewardId === "extraLetters") {
      // Draw WITHOUT replacement (splice each pick out of the pool, and
      // start by excluding whatever's already in hand) -- picking with
      // replacement from the full pool every time let the same consonant
      // turn up twice, adding two cards for one letter instead of three
      // genuinely different ones.
      const existing = new Set(this.state.hand.map(card => card.glyph));
      const pool = this._baseDeckGlyphs().filter(glyph => !this.isInfiniteGlyph(glyph) && !existing.has(glyph));
      const added = [];
      for (let i = 0; i < 3 && pool.length; i += 1) {
        const pickIndex = Math.floor(this.random() * pool.length);
        const glyph = pool[pickIndex];
        pool.splice(pickIndex, 1);
        const card = this._newCard(glyph, "extra");
        this.state.hand.push(card);
        added.push(glyph);
      }
      return added.length
        ? `Extra Letters: ${added.join(", ")} added for this turn.`
        : "No extra letters were available to add.";
    }

    const originalMessage = cuddleV2OriginalRewardEffect.call(this, rewardId);
    if (typeof originalMessage !== "string") return originalMessage;
    return originalMessage.replace(/and is now stays in hand/g, "and now stays in hand");
  };

  // Rewards are applied immediately in the round where they are earned. This
  // also safely migrates an older save that was paused on a banked reward.
  CuddleGame.prototype.chooseQuestReward = function chooseCuddleV2QuestReward(rewardId) {
    if (this.state.status !== "questReward") {
      return { ok: false, error: "No quest reward is open." };
    }
    if (!this.state.questRewardChoices.some(reward => reward.id === rewardId)) {
      return { ok: false, error: "That reward is not available." };
    }

    const pending = this.state.pendingRoundEnd;
    if (pending) {
      // A reward earned on the round-ending guess has nothing left to affect,
      // so it converts to the quest's point value instead -- which is zero
      // until Quest Value / Quest Head Start have been taken.
      let bonus = 0;
      if (pending.type === "solved" && !this.isBossRound()) {
        const entry = this.state.history[this.state.history.length - 1];
        const questBonus = Number(this.state.upgrades.questPoints) || 0;
        if (entry && !entry.questFinalBonus && questBonus > 0) {
          bonus = questBonus;
          entry.questFinalBonus = bonus;
          this.state.score += bonus;
          this.state.roundScore += bonus;
          pending.score = this.state.score;
        }
      }
      this.state.questRewardChoices = [];
      this.state.questRewardRefreshesLeft = 0;
      this.state.deferredRewards = [];
      this.state.lastMessage = pending.type === "solved"
        ? (bonus
          ? `Quest completed on the solving guess: +${bonus} points instead of a carried reward.`
          : "Quest completed on the solving guess, but the round ended before a reward could be used.")
        : "The final guess ended the round, so no reward was carried forward.";
      this._resolvePendingRoundEnd();
      this.save();
      return { ok: true, message: this.state.lastMessage, questFinalBonus: bonus };
    }

    const message = this._applyRewardEffect(rewardId) || "Quest reward applied for this round.";
    this.state.lastMessage = message;
    this.state.questRewardChoices = [];
    this.state.questRewardRefreshesLeft = 0;
    this.state.deferredRewards = [];
    this.state.status = "playing";
    this._ensureQuestForNextGuess();
    this.save();
    return { ok: true, message };
  };

  // If a quest completes on a round-ending guess, never open a reward
  // picker whose effect would spill into a later round. A solving guess earns
  // the quest's point value instead (zero until Quest Value / Quest Head
  // Start have been taken); an unsuccessful final guess simply ends the run
  // without carrying a reward.
  const cuddleV2OriginalSubmitDraft = CuddleGame.prototype.submitDraft;
  CuddleGame.prototype.submitDraft = function submitCuddleV2Draft() {
    const result = cuddleV2OriginalSubmitDraft.call(this);
    if (!result?.ok || !result.questComplete || !this.state.pendingRoundEnd) return result;

    const entry = this.state.history[this.state.history.length - 1];
    let bonus = 0;
    const questBonus = this.isBossRound() ? 0 : (Number(this.state.upgrades.questPoints) || 0);
    if (result.solved && entry && !entry.questFinalBonus && questBonus > 0) {
      bonus = questBonus;
      entry.questFinalBonus = bonus;
      this.state.score += bonus;
      this.state.roundScore += bonus;
      this.state.pendingRoundEnd.score = this.state.score;
    }

    this.state.questRewardChoices = [];
    this.state.questRewardRefreshesLeft = 0;
    this.state.deferredRewards = [];
    this.state.lastMessage += result.solved
      ? (bonus
        ? ` Quest completed on the solving guess: +${bonus} points.`
        : " Quest completed on the solving guess.")
      : " Quest completed on the final attempt, but no reward carries forward.";
    this._resolvePendingRoundEnd();
    this.save();
    return bonus ? { ...result, questFinalBonus: bonus } : result;
  };
  /* UMT_CUDDLE_SINGLEPLAYER_V2: ENGINE END */
  /* UMT_CUDDLE_REBALANCE_V3: ENGINE START */
  // Single-player Cuddle rebalance. This block deliberately touches only the
  // CuddleGame prototype; no multiplayer state, sockets, or shared powers are
  // changed here.
  const CUDDLE_V3_BOSS_TURNS = Object.freeze([2, 2, 3, 4]);
  const CUDDLE_V3_CUSTOM_REWARDS = Object.freeze([
    {
      id: "storybookStart",
      icon: "📖",
      title: "Opening Verse",
      description: "Start every scoring round with +5 points. Stacks up to three times.",
      max: 3
    },
    {
      id: "questSpark",
      icon: "✨",
      title: "Quest Ink",
      description: "Completed quests give +5 additional points. Stacks up to three times.",
      max: 3
    },
    {
      id: "wideChoice",
      icon: "🌈",
      title: "Wide Margins",
      description: "See one additional between-round upgrade choice. Stacks up to two times.",
      max: 2
    },
    {
      id: "openingClue",
      icon: "🔮",
      title: "Margin Note",
      description: "Reveal one secret position at the start of every scoring round. Stacks twice.",
      max: 2
    },
    {
      id: "mulliganEcho",
      icon: "🪶",
      title: "Second Draft",
      description: "Start every scoring round with one additional mulligan.",
      max: 1
    }
  ]);
  const CUDDLE_V3_SYNERGIES = Object.freeze([
    {
      id: "goldenTempo",
      icon: "⚡",
      title: "Golden Tempo",
      description: "Golden Value + Quick Cuddle: every solved scoring round gives +5 points."
    },
    {
      id: "questBinding",
      icon: "🔗",
      title: "Quest Binding",
      description: "Quest Value + Quest Ink: completed quests give another +5 points."
    },
    {
      id: "illustratedStart",
      icon: "🌟",
      title: "Illustrated Start",
      description: "Opening Verse + Margin Note: scoring rounds open with another +5 points."
    },
    {
      id: "endlessMargins",
      icon: "🖋️",
      title: "Endless Margins",
      description: "Wide Margins + Reward Refresh: quest reward screens show one extra option."
    },
    {
      id: "secondEdition",
      icon: "📚",
      title: "Second Edition",
      description: "Second Thoughts + Second Draft: gain one more mulligan in every scoring round."
    }
  ]);

  function cuddleV3RewardDefinition(id) {
    return CUDDLE_V3_CUSTOM_REWARDS.find(item => item.id === id) || null;
  }
  function cuddleV3SynergyDefinition(id) {
    return CUDDLE_V3_SYNERGIES.find(item => item.id === id) || null;
  }
  function cuddleV3EnsureState(game) {
    const state = game?.state;
    if (!state) return null;
    const savedBonuses = state.cuddleBonuses && typeof state.cuddleBonuses === "object"
      ? state.cuddleBonuses
      : {};
    state.cuddleBonuses = {};
    CUDDLE_V3_CUSTOM_REWARDS.forEach(definition => {
      const value = Math.max(0, Math.floor(Number(savedBonuses[definition.id]) || 0));
      state.cuddleBonuses[definition.id] = Math.min(definition.max, value);
    });
    state.rewardSynergies = unique(
      (Array.isArray(state.rewardSynergies) ? state.rewardSynergies : [])
        .filter(id => Boolean(cuddleV3SynergyDefinition(id)))
    );
    state.rewardBookHistory = (Array.isArray(state.rewardBookHistory) ? state.rewardBookHistory : [])
      .filter(item => item && typeof item === "object")
      .slice(-40);
    state.bossRewardHistory = (Array.isArray(state.bossRewardHistory) ? state.bossRewardHistory : [])
      .filter(item => item && typeof item === "object")
      .slice(-12);
    state.bossRewardNotice = state.bossRewardNotice && typeof state.bossRewardNotice === "object"
      ? state.bossRewardNotice
      : null;
    state.synergyNotice = state.synergyNotice && typeof state.synergyNotice === "object"
      ? state.synergyNotice
      : null;
    const sourceKinds = state.mysteryGlyphKinds && typeof state.mysteryGlyphKinds === "object"
      && !Array.isArray(state.mysteryGlyphKinds)
      ? state.mysteryGlyphKinds
      : {};
    const kinds = {};
    Object.entries(sourceKinds).forEach(([glyph, kind]) => {
      const normalized = glyphForLetter(glyph);
      if (!/^[A-Z]$/.test(normalized)) return;
      kinds[normalized] = ["blue", "purple", "unknown"].includes(kind) ? kind : "unknown";
    });
    (Array.isArray(state.unknownGlyphs) ? state.unknownGlyphs : []).forEach(glyph => {
      const normalized = glyphForLetter(glyph);
      if (/^[A-Z]$/.test(normalized) && !kinds[normalized]) kinds[normalized] = "unknown";
    });
    state.mysteryGlyphKinds = kinds;
    state.unknownGlyphs = Object.keys(kinds).sort();
    return state;
  }
  function cuddleV3BossStage(gate, bossesCleared = 0) {
    const explicit = {
      "before-4": 1,
      "before-7": 2,
      "before-10": 3,
      final: 4
    }[gate];
    if (explicit) return explicit;
    return Math.max(1, Math.min(4, Number(bossesCleared || 0) + 1));
  }
  function cuddleV3BossDescription(id, turns) {
    const count = Math.max(1, Number(turns) || 1);
    const guesses = `${count} guess${count === 1 ? "" : "es"}`;
    switch (id) {
      case "countOnly":
        return `During the first ${guesses}, you only see the total number of green and yellow tiles, not their positions. Normal feedback returns afterward.`;
      case "delayedFeedback":
        return `The first ${guesses} reveal no feedback. When the power ends, every withheld result appears at once.`;
      case "hideFeedback":
        return `During the first ${guesses}, one board position hides its feedback. That position behaves normally afterward.`;
      case "blueMode":
        return `During the first ${guesses}, every green or yellow result appears blue. The letter stays reusable, but its exact result remains unresolved.`;
      case "fakeFeedback":
        return `During the first ${guesses}, the displayed colours lie. Those purple mystery letters stay reusable until reliable feedback resolves them.`;
      case "quickMode":
        return `During the first ${guesses}, you have one minute per guess. The timer switches off when the power window ends.`;
      case "shortHand":
        // Not a guess-window constraint like the others -- turns/stage
        // scaling doesn't apply here, so this ignores the passed-in `turns`
        // entirely rather than describing a window that doesn't exist.
        return "Ten random letters are pulled from your deck before this round starts, and you only get four guesses to find the secret.";
      default:
        return `This boss power lasts for the first ${guesses}.`;
    }
  }
  function cuddleV3RetimeBoss(option, stage) {
    const turns = CUDDLE_V3_BOSS_TURNS[Math.max(0, Math.min(3, stage - 1))];
    const reward = option?.reward ? { ...option.reward } : option?.reward;
    if (reward?.id === "cullRare") {
      reward.description = "Remove two rare letters from the deck and from every future secret.";
    }
    return {
      ...option,
      turns,
      stage,
      description: cuddleV3BossDescription(option?.id, turns),
      reward
    };
  }
  function cuddleV3HasSynergy(game, id) {
    return Boolean(game?.state?.rewardSynergies?.includes(id));
  }
  function cuddleV3SynergyIsActive(game, id) {
    const upgrades = game?.state?.upgrades || {};
    const bonuses = game?.state?.cuddleBonuses || {};
    switch (id) {
      case "goldenTempo":
        return Number(upgrades.yellowPoints || 0) > 0 && Number(upgrades.earlyRoundPoint || 0) > 0;
      case "questBinding":
        return Number(upgrades.questPoints || 0) >= 5 && Number(bonuses.questSpark || 0) > 0;
      case "illustratedStart":
        return Number(bonuses.storybookStart || 0) > 0 && Number(bonuses.openingClue || 0) > 0;
      case "endlessMargins":
        return Number(bonuses.wideChoice || 0) > 0 && Number(upgrades.questRefreshes || 0) > 0;
      case "secondEdition":
        return Number(upgrades.extraMulligans || 0) > 0 && Number(bonuses.mulliganEcho || 0) > 0;
      default:
        return false;
    }
  }
  function cuddleV3RefreshSynergies(game, announce = false) {
    const state = cuddleV3EnsureState(game);
    if (!state) return [];
    const owned = new Set(state.rewardSynergies);
    const unlocked = CUDDLE_V3_SYNERGIES.filter(definition => (
      !owned.has(definition.id) && cuddleV3SynergyIsActive(game, definition.id)
    ));
    unlocked.forEach(definition => owned.add(definition.id));
    state.rewardSynergies = [...owned];
    if (announce && unlocked.length) {
      state.synergyNotice = {
        icon: "✨",
        title: unlocked.length === 1 ? "Bonus combination unlocked" : "Bonus combinations unlocked",
        message: unlocked.map(item => `${item.icon} ${item.title}: ${item.description}`).join(" ")
      };
    }
    return unlocked;
  }
  function cuddleV3RecordReward(game, choice, kind = "round") {
    const state = cuddleV3EnsureState(game);
    if (!state || !choice) return;
    state.rewardBookHistory.push({
      id: choice.id || choice.rewardId || "reward",
      icon: choice.icon || "✨",
      title: choice.title || "Reward",
      description: choice.description || "",
      kind,
      round: Number(state.round || 1)
    });
    state.rewardBookHistory = state.rewardBookHistory.slice(-40);
  }
  function cuddleV3NormalizeUpgradeChoice(choice) {
    if (!choice || choice.id !== "removeLetter") return choice;
    const letter = (choice.letters || (choice.letter ? [choice.letter] : []))[0];
    if (!letter) return choice;
    return {
      ...choice,
      key: `removeLetter:${letter}`,
      letter,
      letters: [letter],
      title: `Cull ${letter}`,
      description: `Remove ${letter} from the deck and from every future secret. It was drawn from the ten least-common eligible consonants.`
    };
  }
  function cuddleV3ExpandQuestChoices(game) {
    const state = cuddleV3EnsureState(game);
    if (!state || state.status !== "questReward" || !cuddleV3HasSynergy(game, "endlessMargins")) return;
    const choices = Array.isArray(state.questRewardChoices) ? state.questRewardChoices.slice() : [];
    const seen = new Set(choices.map(item => item?.id).filter(Boolean));
    const pool = window.CuddleQuestBook?.rewardChoices?.(6, game.random) || [];
    for (const reward of pool) {
      if (!reward?.id || seen.has(reward.id)) continue;
      choices.push(reward);
      seen.add(reward.id);
      if (choices.length >= 4) break;
    }
    state.questRewardChoices = choices.slice(0, 4);
  }
  function cuddleV3MysteriesForGuess(game, word, feedback) {
    const result = {};
    const boss = game?.state?.boss;
    if (!boss || !game._bossActive()) return result;
    const markAll = kind => word.split("").forEach(letter => { result[glyphForLetter(letter)] = kind; });
    switch (boss.id) {
      case "countOnly":
      case "delayedFeedback":
        markAll("unknown");
        break;
      case "hideFeedback": {
        const index = Number(boss.hiddenIndex);
        if (Number.isInteger(index) && index >= 0 && index < word.length) {
          result[glyphForLetter(word[index])] = "unknown";
        }
        break;
      }
      case "blueMode":
        word.split("").forEach((letter, index) => {
          if (feedback[index] === "green" || feedback[index] === "yellow") {
            result[glyphForLetter(letter)] = "blue";
          }
        });
        break;
      case "fakeFeedback":
        markAll("purple");
        break;
      default:
        break;
    }
    return result;
  }

  // Keep the source metadata truthful even before a stage-specific boss offer
  // is created. The offer itself is retimed below for stages 1-4.
  if (window.CuddleQuestBook) {
    const deepCull = window.CuddleQuestBook.BOSS_REWARDS?.find(item => item.id === "cullRare");
    if (deepCull) deepCull.description = "Remove two rare letters from the deck and from every future secret.";
    (window.CuddleQuestBook.BOSSES || []).forEach(boss => {
      boss.turns = 2;
      boss.description = cuddleV3BossDescription(boss.id, 2);
    });
  }

  const cuddleV3OriginalHydrateState = CuddleGame.prototype._hydrateState;
  CuddleGame.prototype._hydrateState = function hydrateCuddleV3State() {
    const hadMysteryMap = Boolean(
      this.state?.mysteryGlyphKinds
      && typeof this.state.mysteryGlyphKinds === "object"
      && !Array.isArray(this.state.mysteryGlyphKinds)
    );
    cuddleV3OriginalHydrateState.call(this);
    const state = cuddleV3EnsureState(this);
    if (!state) return;

    // A save paused at the old nine-round final gate becomes the new third
    // gate, so existing progress continues into rounds 10-12 instead of ending
    // early under the expanded campaign.
    const oldFinal = Number(state.round || 0) <= 9 && Number(state.bossesCleared || 0) <= 2;
    if (oldFinal && state.boss?.gate === "final") {
      state.round = 10;
      state.boss.gate = "before-10";
      state.bossGatesDone = (state.bossGatesDone || []).filter(gate => gate !== "final");
    }
    if (oldFinal && state.status === "bossChoice" && (state.bossOffer || []).some(item => item.gate === "final")) {
      state.round = 10;
      state.bossOffer = state.bossOffer.map(item => ({ ...item, gate: "before-10" }));
      state.bossGatesDone = (state.bossGatesDone || []).filter(gate => gate !== "final");
    }
    if (state.boss) {
      const stage = cuddleV3BossStage(state.boss.gate, Math.max(0, Number(state.bossesCleared || 1) - 1));
      state.boss = cuddleV3RetimeBoss(state.boss, stage);
      state.boss.secondsPerGuess = state.boss.id === "quickMode" ? 60 : null;
    }
    if (Array.isArray(state.bossOffer)) {
      state.bossOffer = state.bossOffer.map(item => (
        cuddleV3RetimeBoss(item, cuddleV3BossStage(item.gate, state.bossesCleared))
      ));
    }
    state.upgradeChoices = (state.upgradeChoices || []).map(cuddleV3NormalizeUpgradeChoice);

    // Recover unresolved blue, purple, and question-mark cards from saves made
    // before mystery kinds were persisted.
    if (!hadMysteryMap && state.boss) {
      const kinds = { ...state.mysteryGlyphKinds };
      (state.history || []).forEach(entry => {
        const word = String(entry?.word || "");
        const shown = Array.isArray(entry?.shownFeedback) ? entry.shownFeedback : [];
        word.split("").forEach((letter, index) => {
          const glyph = glyphForLetter(letter);
          if (entry?.fakeFeedback) kinds[glyph] = "purple";
          else if (shown[index] === "blue") kinds[glyph] = "blue";
          else if (shown[index] === "unknown") kinds[glyph] = "unknown";
        });
      });
      state.mysteryGlyphKinds = kinds;
      state.unknownGlyphs = Object.keys(kinds).sort();
    }
    state.infiniteGlyphs = unique([
      ...ALWAYS_AVAILABLE_VOWELS,
      ...(state.infiniteGlyphs || []),
      ...state.unknownGlyphs
    ]).sort();
    cuddleV3RefreshSynergies(this, false);
    this._syncInfiniteCards();
    if (["playing", "questReward"].includes(state.status)
        && this.getCountedHandSize() < this.getHandLimit()) {
      this.drawToHandLimit();
    }
  };

  const cuddleV3OriginalGetMulliganAllowance = CuddleGame.prototype.getMulliganAllowance;
  CuddleGame.prototype.getMulliganAllowance = function getCuddleV3MulliganAllowance() {
    const base = cuddleV3OriginalGetMulliganAllowance.call(this);
    const state = cuddleV3EnsureState(this);
    if (!state || this.isBossRound()) return base;
    return base
      + Number(state.cuddleBonuses.mulliganEcho || 0)
      + Number(cuddleV3HasSynergy(this, "secondEdition"));
  };

  const cuddleV3OriginalBeginRound = CuddleGame.prototype._beginRound;
  CuddleGame.prototype._beginRound = function beginCuddleV3Round() {
    cuddleV3EnsureState(this);
    cuddleV3OriginalBeginRound.call(this);
    const state = cuddleV3EnsureState(this);
    state.mysteryGlyphKinds = {};
    state.unknownGlyphs = [];
    if (this.isBossRound()) return;

    const notes = [];
    const openingPoints = Number(state.cuddleBonuses.storybookStart || 0) * 5
      + (cuddleV3HasSynergy(this, "illustratedStart") ? 5 : 0);
    if (openingPoints > 0) {
      state.score += openingPoints;
      state.roundScore += openingPoints;
      notes.push(`Opening scripts added +${openingPoints} points.`);
    }
    const clues = Number(state.cuddleBonuses.openingClue || 0);
    for (let index = 0; index < clues; index += 1) {
      const message = this._applyRewardEffect("revealLocation");
      if (message) notes.push(message);
    }
    if (notes.length) state.lastMessage = `${state.lastMessage} ${notes.join(" ")}`.trim();
  };

  const cuddleV3OriginalOpenBossGate = CuddleGame.prototype._openBossGate;
  CuddleGame.prototype._openBossGate = function openCuddleV3BossGate(round) {
    const opened = cuddleV3OriginalOpenBossGate.call(this, round);
    if (!opened) return false;
    const stage = cuddleV3BossStage(this.state.bossOffer?.[0]?.gate, this.state.bossesCleared);
    this.state.bossOffer = (this.state.bossOffer || []).map(option => cuddleV3RetimeBoss(option, stage));
    return true;
  };

  const cuddleV3OriginalChooseBoss = CuddleGame.prototype.chooseBoss;
  CuddleGame.prototype.chooseBoss = function chooseCuddleV3Boss(bossId) {
    const result = cuddleV3OriginalChooseBoss.call(this, bossId);
    if (result?.ok && this.state?.boss) {
      const stage = cuddleV3BossStage(this.state.boss.gate, Math.max(0, Number(this.state.bossesCleared || 0)));
      this.state.boss = cuddleV3RetimeBoss(this.state.boss, stage);
      this.state.boss.secondsPerGuess = this.state.boss.id === "quickMode" ? 60 : null;
      this.save();
    }
    return result;
  };

  const cuddleV3OriginalApplyBossReward = CuddleGame.prototype._applyBossReward;
  CuddleGame.prototype._applyBossReward = function applyCuddleV3BossReward(rewardId) {
    if (rewardId !== "cullRare") return cuddleV3OriginalApplyBossReward.call(this, rewardId);
    const letters = this._removalCandidates(2);
    if (!letters.length) return "No letters were safe to remove.";
    this.state.removedLetters = unique([...this.state.removedLetters, ...letters]).sort();
    return `Deep Cull removed ${letters.join(", ")}.`;
  };

  // Bosses grant only their own displayed reward. The ordinary post-round
  // upgrade screen is intentionally skipped after a boss.
  CuddleGame.prototype._clearBoss = function clearCuddleV3Boss() {
    const state = cuddleV3EnsureState(this);
    const boss = state?.boss;
    if (!boss) return;
    const finalBoss = boss.gate === "final";
    // Short Hand's ten letters were only ever removed "for this round" --
    // put them back now that the round is actually over, without disturbing
    // any permanent removal (e.g. Deep Cull) sitting alongside them.
    if (boss.tempRemovedLetters?.length) {
      const temp = new Set(boss.tempRemovedLetters);
      state.removedLetters = (state.removedLetters || []).filter(letter => !temp.has(letter));
    }
    state.boss = null;
    state.bossesCleared = Number(state.bossesCleared || 0) + 1;
    state.unknownGlyphs = [];
    state.mysteryGlyphKinds = {};
    state.infiniteGlyphs = [...ALWAYS_AVAILABLE_VOWELS];
    state.bossGatesDone = unique([...(state.bossGatesDone || []), boss.gate].filter(Boolean));
    state.lastClearedBossGate = boss.gate || null;

    const reward = window.CuddleQuestBook?.getBossReward?.(boss.rewardId) || {
      id: boss.rewardId,
      icon: "🎁",
      title: "Boss reward",
      description: ""
    };
    if (reward.id === "cullRare") {
      reward.description = "Remove two rare letters from the deck and from every future secret.";
    }
    // Position Peek can't do anything useful against the secret that was
    // JUST solved to beat this boss -- bank it instead (via its own flag,
    // NOT state.deferredRewards -- see _beginRound's note on why that array
    // is a dead end here), so it actually fires once the next round's fresh
    // secret exists.
    let rewardMessage;
    if (boss.rewardId === "revealGreen") {
      state.pendingPositionPeek = true;
      rewardMessage = "Position Peek will reveal a letter once your next round begins.";
    } else {
      rewardMessage = this._applyBossReward(boss.rewardId);
    }
    const record = {
      ...reward,
      bossTitle: boss.title,
      round: Number(state.round || 1),
      message: rewardMessage
    };
    state.bossRewardHistory.push(record);
    state.bossRewardHistory = state.bossRewardHistory.slice(-12);
    cuddleV3RecordReward(this, reward, "boss");
    state.bossRewardNotice = {
      icon: reward.icon || "🎁",
      title: reward.title || "Boss reward",
      bossTitle: boss.title || "Boss",
      message: rewardMessage || reward.description || "Permanent boss reward received."
    };
    cuddleV3RefreshSynergies(this, true);

    if (finalBoss) {
      state.status = "won";
      state.failureReason = null;
      state.lastMessage = `You beat the final boss: ${boss.title}.${rewardMessage ? ` ${rewardMessage}` : ""}`;
      this.save();
      return;
    }

    this._advanceRound();
  };

  const cuddleV3OriginalUpgradeCatalog = CuddleGame.prototype._upgradeCatalog;
  CuddleGame.prototype._upgradeCatalog = function cuddleV3UpgradeCatalog() {
    const state = cuddleV3EnsureState(this);
    const base = cuddleV3OriginalUpgradeCatalog.call(this)
      .map(cuddleV3NormalizeUpgradeChoice)
      .filter(Boolean);
    const extras = CUDDLE_V3_CUSTOM_REWARDS
      .filter(definition => Number(state.cuddleBonuses[definition.id] || 0) < definition.max)
      .map(definition => ({ ...definition, key: definition.id }));
    return [...base, ...extras];
  };
  CuddleGame.prototype._generateUpgradeChoices = function generateCuddleV3UpgradeChoices() {
    const state = cuddleV3EnsureState(this);
    const count = 3 + Math.min(2, Number(state.cuddleBonuses.wideChoice || 0));
    return shuffle(this._upgradeCatalog(), this.random).slice(0, count);
  };
  CuddleGame.prototype.chooseUpgrade = function chooseCuddleV3Upgrade(choiceKey) {
    const state = cuddleV3EnsureState(this);
    if (state.status !== "upgrade") return { ok: false, error: "No upgrade choice is open." };
    const choice = (state.upgradeChoices || []).find(item => item.key === choiceKey);
    if (!choice) return { ok: false, error: "That upgrade is not available." };

    const custom = cuddleV3RewardDefinition(choice.id);
    if (custom) {
      const current = Number(state.cuddleBonuses[custom.id] || 0);
      if (current >= custom.max) return { ok: false, error: "That reward is already fully upgraded." };
      state.cuddleBonuses[custom.id] = current + 1;
    } else {
      switch (choice.id) {
        case "removeLetter": {
          const letter = (choice.letters || (choice.letter ? [choice.letter] : []))[0];
          if (!letter) return { ok: false, error: "No removable letter was attached to that reward." };
          state.removedLetters = unique([...state.removedLetters, letter]).sort();
          break;
        }
        case "extraMulligans":
        case "mulliganSize":
        case "yellowPoints":
        case "earlyRoundPoint":
        case "questRefreshes":
        case "questCadence":
          state.upgrades[choice.id] = Number(state.upgrades[choice.id] || 0) + 1;
          break;
        case "questPoints":
          state.upgrades.questPoints = Number(state.upgrades.questPoints || 0) + 5;
          break;
        default:
          return { ok: false, error: "Unknown upgrade." };
      }
    }

    cuddleV3RecordReward(this, choice, "round");
    const unlocked = cuddleV3RefreshSynergies(this, true);
    state.lastMessage = `${choice.title} acquired.${unlocked.length ? ` ${unlocked.map(item => item.title).join(" + ")} unlocked.` : ""}`;
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    this._advanceRound();
    this.save();
    return { ok: true, synergies: unlocked.map(item => item.id) };
  };

  // Card status must use only feedback the player was actually allowed to
  // learn. Reading true hidden feedback here would leak boss information.
  CuddleGame.prototype.getCardKnowledgeStatus = function getCuddleV3CardKnowledgeStatus(cardOrGlyph) {
    const glyph = typeof cardOrGlyph === "string" ? cardOrGlyph : cardOrGlyph?.glyph;
    if (!glyph) return "unused";
    const letter = glyphForLetter(glyph);
    if ((this.state.revealedPositions || []).includes(letter)) return "green";
    let sawYellow = false;
    for (const entry of this.state.history || []) {
      if (entry?.fakeFeedback) continue;
      const word = String(entry?.word || "");
      const shown = Array.isArray(entry?.shownFeedback) ? entry.shownFeedback : entry?.feedback || [];
      for (let index = 0; index < word.length; index += 1) {
        if (word[index] !== letter) continue;
        if (shown[index] === "green") return "green";
        if (shown[index] === "yellow" || shown[index] === "blue") sawYellow = true;
      }
    }
    if (sawYellow || (this.state.knownPresent || []).includes(letter)) return "yellow";
    if ((this.state.knownAbsent || []).includes(letter)) return "red";
    return "unused";
  };

  const cuddleV3OriginalSyncInfiniteCards = CuddleGame.prototype._syncInfiniteCards;
  CuddleGame.prototype._syncInfiniteCards = function syncCuddleV3InfiniteCards() {
    const state = cuddleV3EnsureState(this);
    if (!state) return cuddleV3OriginalSyncInfiniteCards.call(this);
    const durable = new Set([
      ...ALWAYS_AVAILABLE_VOWELS,
      ...(state.knownPresent || []),
      ...(state.revealedPositions || []).filter(Boolean).map(glyphForLetter),
      ...(state.unknownGlyphs || []),
      ...Object.keys(state.mysteryGlyphKinds || {})
    ]);
    state.infiniteGlyphs = (state.infiniteGlyphs || []).filter(glyph => durable.has(glyph));
    return cuddleV3OriginalSyncInfiniteCards.call(this);
  };

  const cuddleV3OriginalSubmitDraft = CuddleGame.prototype.submitDraft;
  CuddleGame.prototype.submitDraft = function submitCuddleV3Draft() {
    const state = cuddleV3EnsureState(this);
    const validation = this.canSubmit();
    if (!validation.ok || Number(state.guessesUsed || 0) >= this._effectiveMaxGuesses()) {
      return cuddleV3OriginalSubmitDraft.call(this);
    }

    const word = validation.word;
    const feedback = evaluateFeedback(state.secret, word);
    const bossBefore = state.boss ? { ...state.boss } : null;
    const roundBefore = Number(state.round || 1);
    const historyLengthBefore = (state.history || []).length;
    const oldScore = Number(state.score || 0);
    const oldRoundScore = Number(state.roundScore || 0);
    const oldUnknown = (state.unknownGlyphs || []).slice();
    const oldInfinite = (state.infiniteGlyphs || []).slice();
    const oldKinds = { ...(state.mysteryGlyphKinds || {}) };
    const newMysteries = cuddleV3MysteriesForGuess(this, word, feedback);

    if (Object.keys(newMysteries).length) {
      state.mysteryGlyphKinds = { ...oldKinds, ...newMysteries };
      state.unknownGlyphs = Object.keys(state.mysteryGlyphKinds).sort();
      state.knownAbsent = (state.knownAbsent || []).filter(letter => !state.unknownGlyphs.includes(letter));
      // Do not sync yet: the draft still points at the finite card IDs. The
      // original submit discards those IDs and then promotes these glyphs.
      state.infiniteGlyphs = unique([...state.infiniteGlyphs, ...state.unknownGlyphs]).sort();
    }

    let questExtra = 0;
    let solveExtra = 0;
    if (!bossBefore) {
      let questComplete = false;
      if (state.activeQuest) {
        try {
          questComplete = Boolean(this.wouldDraftCompleteQuest());
        } catch {
          questComplete = false;
        }
      }
      if (questComplete) {
        questExtra = Number(state.cuddleBonuses.questSpark || 0) * 5
          + (cuddleV3HasSynergy(this, "questBinding") ? 5 : 0);
      }
      if (word === state.secret && cuddleV3HasSynergy(this, "goldenTempo")) solveExtra = 5;
      const extra = questExtra + solveExtra;
      if (extra > 0) {
        state.score += extra;
        state.roundScore += extra;
      }
    }

    const result = cuddleV3OriginalSubmitDraft.call(this);
    if (!result?.ok) {
      state.score = oldScore;
      state.roundScore = oldRoundScore;
      state.unknownGlyphs = oldUnknown;
      state.infiniteGlyphs = oldInfinite;
      state.mysteryGlyphKinds = oldKinds;
      return result;
    }

    const entry = (this.state.history || []).length > historyLengthBefore
      ? this.state.history[this.state.history.length - 1]
      : null;
    if (entry?.word === word) {
      if (questExtra) entry.cuddleQuestBonus = questExtra;
      if (solveExtra) entry.cuddleSolveBonus = solveExtra;
    }

    const sameBossRound = Boolean(
      bossBefore
      && this.state.boss
      && this.state.boss.id === bossBefore.id
      && this.state.boss.gate === bossBefore.gate
      && Number(this.state.round || 1) === roundBefore
    );
    if (sameBossRound) {
      const delayedReleased = bossBefore.id === "delayedFeedback" && !this._bossActive();
      const nextKinds = delayedReleased ? {} : { ...oldKinds };
      if (!delayedReleased) {
        unique(word.split("").map(glyphForLetter)).forEach(glyph => {
          if (newMysteries[glyph]) nextKinds[glyph] = newMysteries[glyph];
          else delete nextKinds[glyph];
        });
      }
      this.state.mysteryGlyphKinds = nextKinds;
      this.state.unknownGlyphs = Object.keys(nextKinds).sort();
      this.state.knownAbsent = (this.state.knownAbsent || [])
        .filter(letter => !this.state.unknownGlyphs.includes(letter));
      this.state.infiniteGlyphs = unique([
        ...(this.state.infiniteGlyphs || []),
        ...this.state.unknownGlyphs
      ]).sort();
      this._syncInfiniteCards();
      // A mystery card may have been finite when drafted, then promoted to
      // reusable for the boss guess. If that mystery resolves now, syncing can
      // remove the promoted copy; refill the ordinary hand immediately.
      this.drawToHandLimit();
    }

    cuddleV3ExpandQuestChoices(this);
    const scriptBonus = questExtra + solveExtra;
    if (scriptBonus > 0) {
      this.state.lastMessage = `${this.state.lastMessage || ""} Reward-book bonus: +${scriptBonus} points.`.trim();
      result.cuddleBonus = scriptBonus;
      result.totalScoreDelta = Number(result.scoreDelta || 0) + scriptBonus;
    }
    this.save();
    return result;
  };

  const cuddleV3OriginalRefreshQuestRewards = CuddleGame.prototype.refreshQuestRewards;
  CuddleGame.prototype.refreshQuestRewards = function refreshCuddleV3QuestRewards() {
    const result = cuddleV3OriginalRefreshQuestRewards.call(this);
    if (result?.ok) {
      cuddleV3ExpandQuestChoices(this);
      this.save();
    }
    return result;
  };

  const cuddleV3OriginalGetRulesSummary = CuddleGame.prototype.getRulesSummary;
  CuddleGame.prototype.getRulesSummary = function getCuddleV3RulesSummary() {
    const summary = cuddleV3OriginalGetRulesSummary.call(this);
    const state = cuddleV3EnsureState(this);
    summary.questPoints += Number(state?.cuddleBonuses?.questSpark || 0) * 5
      + (cuddleV3HasSynergy(this, "questBinding") ? 5 : 0);
    return summary;
  };

  const cuddleV3OriginalUpgradeSummary = CuddleGame.prototype.getUpgradeSummary;
  CuddleGame.prototype.getUpgradeSummary = function getCuddleV3UpgradeSummary() {
    const state = cuddleV3EnsureState(this);
    const lines = cuddleV3OriginalUpgradeSummary.call(this);
    CUDDLE_V3_CUSTOM_REWARDS.forEach(definition => {
      const count = Number(state.cuddleBonuses[definition.id] || 0);
      if (count) lines.push(`${definition.icon} ${definition.title} ×${count}`);
    });
    state.rewardSynergies.forEach(id => {
      const synergy = cuddleV3SynergyDefinition(id);
      if (synergy) lines.push(`${synergy.icon} Combo: ${synergy.title}`);
    });
    return unique(lines);
  };

  const cuddleV3OriginalCurrentModifications = CuddleGame.prototype.getCurrentModifications;
  CuddleGame.prototype.getCurrentModifications = function getCuddleV3CurrentModifications() {
    const state = cuddleV3EnsureState(this);
    const lines = cuddleV3OriginalCurrentModifications.call(this);
    CUDDLE_V3_CUSTOM_REWARDS.forEach(definition => {
      const count = Number(state.cuddleBonuses[definition.id] || 0);
      if (count) lines.push(`${definition.icon} ${definition.title} ×${count}`);
    });
    state.rewardSynergies.forEach(id => {
      const synergy = cuddleV3SynergyDefinition(id);
      if (synergy) lines.push(`${synergy.icon} ${synergy.title} combination active`);
    });
    return unique(lines);
  };

  CuddleGame.prototype.getMysteryKind = function getCuddleV3MysteryKind(glyph) {
    const state = cuddleV3EnsureState(this);
    return state?.mysteryGlyphKinds?.[glyphForLetter(glyph)] || null;
  };
  CuddleGame.prototype.dismissBossRewardNotice = function dismissCuddleV3BossRewardNotice() {
    const state = cuddleV3EnsureState(this);
    if (!state?.bossRewardNotice) return { ok: false };
    state.bossRewardNotice = null;
    this.save();
    return { ok: true };
  };
  CuddleGame.prototype.dismissSynergyNotice = function dismissCuddleV3SynergyNotice() {
    const state = cuddleV3EnsureState(this);
    if (!state?.synergyNotice) return { ok: false };
    state.synergyNotice = null;
    this.save();
    return { ok: true };
  };
  CuddleGame.prototype.getRewardBook = function getCuddleV3RewardBook() {
    const state = cuddleV3EnsureState(this);
    const history = (state.rewardBookHistory || []).slice().reverse();
    const synergies = CUDDLE_V3_SYNERGIES.map(definition => ({
      id: definition.id,
      icon: definition.icon,
      title: definition.title,
      description: definition.description,
      unlocked: state.rewardSynergies.includes(definition.id)
    }));
    // Every collected reward fills one script; synergies add a bonus flourish.
    const progress = Math.min(16, history.length + state.rewardSynergies.length);
    return {
      progress,
      maximum: 16,
      history,
      synergies,
      customRewards: CUDDLE_V3_CUSTOM_REWARDS.map(definition => ({
        ...definition,
        count: Number(state.cuddleBonuses[definition.id] || 0)
      }))
    };
  };
  /* UMT_CUDDLE_REBALANCE_V3: ENGINE END */
  window.CuddleEngine = Object.freeze({
    CuddleGame,
    VERSION,
    STORAGE_KEY,
    THRESHOLDS,
    MAX_GUESSES,
    BASE_HAND_SIZE,
    BASE_MULLIGANS,
    BASE_MULLIGAN_SIZE,
    VOWELS,
    ALWAYS_AVAILABLE_VOWELS,
    normalizeWords,
    evaluateFeedback,
    tokensForWord,
    glyphForLetter
  });
}());

/* UMT_CUDDLE_BALANCE_REFRESH_HARDMODE_V1: ENGINE START */
(function () {
  "use strict";

  const Engine = window.CuddleEngine;
  const CuddleGame = Engine && Engine.CuddleGame;
  if (!CuddleGame) return;

  const prototype = CuddleGame.prototype;
  const baseHandSize = Number(Engine.BASE_HAND_SIZE) || 5;
  const retiredUpgradeIds = new Set(["yellowPoints", "earlyRoundPoint"]);
  const customUpgradeDefinitions = Object.freeze([
    {
      id: "greyPointBoost",
      key: "greyPointBoost",
      icon: "G+",
      title: "Grey Matters",
      description: "Grey tiles are worth 1 more point. This reward stacks."
    },
    {
      id: "handSizeBoost",
      key: "handSizeBoost",
      icon: "H+",
      title: "Bigger Hand",
      description: "Increase the counted hand size by 1 for future rounds."
    },
    {
      id: "mulliganValueBoost",
      key: "mulliganValueBoost",
      icon: "M+",
      title: "Mulligan Dividend",
      description: "Each unused mulligan is worth 5 more points when you solve."
    },
    {
      id: "earlySolveBoost",
      key: "earlySolveBoost",
      icon: "E+",
      title: "Early Finish",
      description: "Each unused guess is worth 5 more early-solve points."
    },
    {
      id: "colourTrade",
      key: "colourTrade",
      icon: "Y/G",
      title: "Colour Surge",
      description: "Yellow and green gain 2 points each, but grey loses 1 point. This reward stacks."
    },
    {
      id: "greyscale",
      key: "greyscale",
      icon: "GREY",
      title: "Greyscale",
      description: "Grey gains 2 points, while yellow and green are reduced to 0 for the run."
    }
  ]);
  const customUpgradeIds = new Set(customUpgradeDefinitions.map(item => item.id));
  const colourUpgradeIds = new Set(["colourTrade", "greyscale"]);
  const goldenTempoDefinition = Object.freeze({
    id: "goldenTempo",
    icon: "⚡",
    title: "Golden Tempo",
    description: "A colour-value reward plus an early-solve reward: every solved scoring round gives +5 points."
  });

  function finiteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function choiceIdentity(choice) {
    return String(choice?.key || choice?.id || "");
  }

  function uniqueLines(lines) {
    return [...new Set((Array.isArray(lines) ? lines : []).filter(Boolean).map(String))];
  }

  function ensureBalanceState(game) {
    if (!game || !game.state) return null;
    const state = game.state;
    state.upgrades = state.upgrades || {};
    const upgrades = state.upgrades;
    upgrades.greyPoints = finiteNumber(upgrades.greyPoints);
    upgrades.handSizeBonus = Math.max(0, finiteNumber(upgrades.handSizeBonus));
    upgrades.mulliganPointBonus = finiteNumber(upgrades.mulliganPointBonus);
    upgrades.earlyRoundPoint = finiteNumber(upgrades.earlyRoundPoint);
    upgrades.yellowPoints = finiteNumber(upgrades.yellowPoints);
    upgrades.zeroColourPoints = finiteNumber(upgrades.zeroColourPoints) > 0 ? 1 : 0;

    state.upgradeRefreshesUsed = Math.max(
      0,
      Math.floor(finiteNumber(state.upgradeRefreshesUsed))
    );

    const savedCounts = state.balanceRewardCounts
      && typeof state.balanceRewardCounts === "object"
      && !Array.isArray(state.balanceRewardCounts)
      ? state.balanceRewardCounts
      : {};
    state.balanceRewardCounts = {};
    customUpgradeDefinitions.forEach(definition => {
      state.balanceRewardCounts[definition.id] = Math.max(
        0,
        Math.floor(finiteNumber(savedCounts[definition.id]))
      );
    });

    state.rewardBookHistory = (Array.isArray(state.rewardBookHistory)
      ? state.rewardBookHistory
      : [])
      .filter(item => item && typeof item === "object")
      .slice(-40);
    state.rewardSynergies = [...new Set(
      (Array.isArray(state.rewardSynergies) ? state.rewardSynergies : [])
        .filter(id => typeof id === "string" && id)
    )];
    return state;
  }

  function signed(value) {
    const number = finiteNumber(value);
    return number > 0 ? `+${number}` : String(number);
  }

  function recordCustomReward(game, choice) {
    const state = ensureBalanceState(game);
    if (!state || !choice) return;
    state.rewardBookHistory.push({
      id: choice.id || "reward",
      icon: choice.icon || "✨",
      title: choice.title || "Reward",
      description: choice.description || "",
      kind: "round",
      round: Number(state.round || 1)
    });
    state.rewardBookHistory = state.rewardBookHistory.slice(-40);
  }

  function unlockGoldenTempoIfReady(game) {
    const state = ensureBalanceState(game);
    if (!state || state.rewardSynergies.includes(goldenTempoDefinition.id)) return [];
    const upgrades = state.upgrades;
    if (!(finiteNumber(upgrades.yellowPoints) > 0 && finiteNumber(upgrades.earlyRoundPoint) > 0)) {
      return [];
    }
    state.rewardSynergies.push(goldenTempoDefinition.id);
    state.synergyNotice = {
      icon: "✨",
      title: "Bonus combination unlocked",
      message: `${goldenTempoDefinition.icon} ${goldenTempoDefinition.title}: ${goldenTempoDefinition.description}`
    };
    return [goldenTempoDefinition];
  }

  const originalHydrateState = prototype._hydrateState;
  prototype._hydrateState = function hydrateBalanceState() {
    if (typeof originalHydrateState === "function") originalHydrateState.call(this);
    const state = ensureBalanceState(this);
    if (!state || state.status !== "upgrade" || !Array.isArray(state.upgradeChoices)) return;
    const invalidSavedChoice = state.upgradeChoices.some(choice => (
      retiredUpgradeIds.has(choice?.id)
      || (state.upgrades.zeroColourPoints > 0 && colourUpgradeIds.has(choice?.id))
    ));
    if (invalidSavedChoice) state.upgradeChoices = this._generateUpgradeChoices();
  };

  const originalGetHandLimit = prototype.getHandLimit;
  prototype.getHandLimit = function getUpgradedHandLimit() {
    ensureBalanceState(this);
    const base = typeof originalGetHandLimit === "function"
      ? finiteNumber(originalGetHandLimit.call(this), baseHandSize)
      : baseHandSize;
    return Math.max(1, base + finiteNumber(this.state.upgrades.handSizeBonus));
  };

  const originalRulesSummary = prototype.getRulesSummary;
  prototype.getRulesSummary = function getBalancedRulesSummary() {
    const state = ensureBalanceState(this);
    const rules = typeof originalRulesSummary === "function"
      ? (originalRulesSummary.call(this) || {})
      : {};
    const upgrades = state?.upgrades || {};
    const coloursDisabled = upgrades.zeroColourPoints > 0;
    return {
      ...rules,
      handSize: this.getHandLimit(),
      greyPoints: finiteNumber(upgrades.greyPoints),
      yellowPoints: coloursDisabled
        ? 0
        : finiteNumber(rules.yellowPoints, 1 + finiteNumber(upgrades.yellowPoints)),
      greenPoints: coloursDisabled
        ? 0
        : finiteNumber(rules.greenPoints, 2 + finiteNumber(upgrades.yellowPoints)),
      earlyPoint: finiteNumber(rules.earlyPoint, 10 + finiteNumber(upgrades.earlyRoundPoint)),
      mulliganPoints: finiteNumber(rules.mulliganPoints, 3)
        + finiteNumber(upgrades.mulliganPointBonus)
    };
  };

  const originalUpgradeCatalog = prototype._upgradeCatalog;
  prototype._upgradeCatalog = function getBalancedUpgradeCatalog() {
    const state = ensureBalanceState(this);
    const originalChoices = typeof originalUpgradeCatalog === "function"
      ? originalUpgradeCatalog.call(this)
      : [];
    const choices = (Array.isArray(originalChoices) ? originalChoices : []).filter(choice => (
      !retiredUpgradeIds.has(choice?.id) && !customUpgradeIds.has(choice?.id)
    ));
    const additions = customUpgradeDefinitions.filter(definition => (
      !(state.upgrades.zeroColourPoints > 0 && colourUpgradeIds.has(definition.id))
    ));
    return [...choices, ...additions].map(choice => ({
      ...choice,
      key: choice.key || choice.id
    }));
  };

  const originalChooseUpgrade = prototype.chooseUpgrade;
  prototype.chooseUpgrade = function chooseBalancedUpgrade(choiceKey) {
    if (this.state?.status !== "upgrade") {
      return typeof originalChooseUpgrade === "function"
        ? originalChooseUpgrade.call(this, choiceKey)
        : { ok: false, error: "No upgrade choice is open." };
    }
    const state = ensureBalanceState(this);
    const choice = Array.isArray(state.upgradeChoices)
      ? state.upgradeChoices.find(item => choiceIdentity(item) === String(choiceKey))
      : null;
    if (!choice || !customUpgradeIds.has(choice.id)) {
      return typeof originalChooseUpgrade === "function"
        ? originalChooseUpgrade.call(this, choiceKey)
        : { ok: false, error: "That upgrade is not available." };
    }
    if (state.upgrades.zeroColourPoints > 0 && colourUpgradeIds.has(choice.id)) {
      return { ok: false, error: "That colour reward is no longer available after Greyscale." };
    }

    const upgrades = state.upgrades;
    switch (choice.id) {
      case "greyPointBoost":
        upgrades.greyPoints += 1;
        break;
      case "handSizeBoost":
        upgrades.handSizeBonus += 1;
        break;
      case "colourTrade":
        upgrades.yellowPoints += 2;
        upgrades.greyPoints -= 1;
        break;
      case "greyscale":
        upgrades.greyPoints += 2;
        upgrades.yellowPoints = 0;
        upgrades.zeroColourPoints = 1;
        break;
      case "mulliganValueBoost":
        upgrades.mulliganPointBonus += 5;
        break;
      case "earlySolveBoost":
        upgrades.earlyRoundPoint += 5;
        break;
      default:
        return { ok: false, error: "Unknown upgrade." };
    }

    state.balanceRewardCounts[choice.id] += 1;
    recordCustomReward(this, choice);
    const unlocked = unlockGoldenTempoIfReady(this);
    state.lastMessage = `${choice.title} acquired.${unlocked.length ? ` ${unlocked.map(item => item.title).join(" + ")} unlocked.` : ""}`;
    state.upgradeChoices = [];
    state.upgradePhase = null;
    state.upgradeMilestone = null;
    this._advanceRound();
    this.save();
    return { ok: true, synergies: unlocked.map(item => item.id) };
  };

  prototype.getUpgradeRefreshCost = function getUpgradeRefreshCost() {
    const state = ensureBalanceState(this);
    const used = state ? state.upgradeRefreshesUsed : 0;
    return used === 0 ? 0 : used * 2 + 1;
  };

  prototype.refreshUpgradeChoices = function refreshUpgradeChoices() {
    if (this.state?.status !== "upgrade") {
      return { ok: false, error: "No between-round reward choices are open." };
    }
    const state = ensureBalanceState(this);
    const cost = this.getUpgradeRefreshCost();
    const score = finiteNumber(state.score);
    if (cost > 0 && cost > score) {
      return { ok: false, error: `You need ${cost} points to refresh these choices.` };
    }

    const currentChoices = (Array.isArray(state.upgradeChoices) ? state.upgradeChoices : [])
      .filter(Boolean);
    const choiceCount = Math.max(1, currentChoices.length || 3);
    const currentKey = currentChoices.map(choiceIdentity).sort().join("|");
    let nextChoices = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const generated = this._generateUpgradeChoices();
      nextChoices = (Array.isArray(generated) ? generated : []).filter(Boolean);
      const nextKey = nextChoices.map(choiceIdentity).sort().join("|");
      if (nextChoices.length && nextKey !== currentKey) break;
    }

    let nextKey = nextChoices.map(choiceIdentity).sort().join("|");
    if (!nextChoices.length || nextKey === currentKey) {
      const currentKeys = new Set(currentChoices.map(choiceIdentity));
      const catalogResult = this._upgradeCatalog();
      const catalog = (Array.isArray(catalogResult) ? catalogResult : [])
        .filter(Boolean)
        .map(choice => ({ ...choice, key: choice.key || choice.id }));
      nextChoices = [
        ...catalog.filter(choice => !currentKeys.has(choiceIdentity(choice))),
        ...catalog.filter(choice => currentKeys.has(choiceIdentity(choice)))
      ].slice(0, choiceCount);
      nextKey = nextChoices.map(choiceIdentity).sort().join("|");
    }
    if (!nextChoices.length || nextKey === currentKey) {
      return { ok: false, error: "There are no different reward choices available right now." };
    }

    if (cost > 0) state.score = score - cost;
    state.upgradeRefreshesUsed += 1;
    state.upgradeChoices = nextChoices;
    state.lastMessage = cost === 0
      ? "Reward choices refreshed for free."
      : `Reward choices refreshed for ${cost} points.`;
    this.save();
    return { ok: true, cost, message: state.lastMessage };
  };

  const originalAdvanceRound = prototype._advanceRound;
  prototype._advanceRound = function advanceAfterBalancedUpgrade() {
    if (this.state) this.state.upgradeRefreshesUsed = 0;
    return typeof originalAdvanceRound === "function"
      ? originalAdvanceRound.call(this)
      : undefined;
  };

  const originalUpgradeSummary = prototype.getUpgradeSummary;
  prototype.getUpgradeSummary = function getBalancedUpgradeSummary() {
    const state = ensureBalanceState(this);
    const rules = this.getRulesSummary();
    const removed = state.removedLetters && state.removedLetters.length
      ? state.removedLetters.join(", ")
      : "None";
    const previous = typeof originalUpgradeSummary === "function"
      ? originalUpgradeSummary.call(this)
      : [];
    const replacedPrefixes = [
      "Counted hand size:",
      "Tile values:",
      "Mulligans:",
      "Yellow value:",
      "Early value:",
      "Early solve:",
      "Quest value:",
      "Quest cadence:",
      "Quest refreshes:",
      "Quest reward refreshes:",
      "Removed letters:"
    ];
    const preserved = (Array.isArray(previous) ? previous : []).filter(line => (
      !replacedPrefixes.some(prefix => String(line).startsWith(prefix))
    ));
    const customLines = customUpgradeDefinitions
      .filter(definition => state.balanceRewardCounts[definition.id] > 0)
      .map(definition => (
        `${definition.icon} ${definition.title} ×${state.balanceRewardCounts[definition.id]}`
      ));
    return uniqueLines([
      `Counted hand size: ${rules.handSize}`,
      `Tile values: grey ${signed(rules.greyPoints)}, yellow ${signed(rules.yellowPoints)}, green ${signed(rules.greenPoints)}`,
      `Mulligans: ${rules.mulligans} × up to ${rules.mulliganSize}; ${signed(rules.mulliganPoints)} per unused mulligan`,
      `Early solve: ${signed(rules.earlyPoint)} per unused guess`,
      `Quest value: ${signed(rules.questPoints)}`,
      `Quest cadence: every ${rules.questCadence} turn${rules.questCadence === 1 ? "" : "s"}`,
      `Quest reward refreshes: ${rules.questRefreshes}`,
      `Removed letters: ${removed}`,
      ...preserved,
      ...customLines
    ]);
  };

  const originalCurrentModifications = prototype.getCurrentModifications;
  prototype.getCurrentModifications = function getBalancedCurrentModifications() {
    const state = ensureBalanceState(this);
    const upgrades = state.upgrades;
    let modifications = typeof originalCurrentModifications === "function"
      ? originalCurrentModifications.call(this)
      : [];
    modifications = (Array.isArray(modifications) ? modifications : [])
      .filter(line => !String(line).startsWith("No run upgrades yet"));

    if (upgrades.handSizeBonus) {
      modifications.push(`Counted hand size is ${this.getHandLimit()}`);
    }
    if (upgrades.greyPoints) {
      modifications.push(`Grey tiles score ${signed(upgrades.greyPoints)} each`);
    }
    if (upgrades.zeroColourPoints) {
      modifications.push("Yellow and green tiles score 0");
    }
    if (upgrades.mulliganPointBonus) {
      modifications.push(`Unused mulligans are worth +${upgrades.mulliganPointBonus} extra each`);
    }
    customUpgradeDefinitions.forEach(definition => {
      const count = state.balanceRewardCounts[definition.id];
      if (count) modifications.push(`${definition.icon} ${definition.title} ×${count}`);
    });

    const unique = uniqueLines(modifications);
    return unique.length
      ? unique
      : ["No run upgrades yet; base Cuddle rules are active."];
  };

  const originalRewardBook = prototype.getRewardBook;
  prototype.getRewardBook = function getBalancedRewardBook() {
    const state = ensureBalanceState(this);
    const book = typeof originalRewardBook === "function"
      ? (originalRewardBook.call(this) || {})
      : {};
    const existingCustom = Array.isArray(book.customRewards) ? book.customRewards : [];
    const existingIds = new Set(existingCustom.map(item => item?.id).filter(Boolean));
    const customRewards = [
      ...existingCustom,
      ...customUpgradeDefinitions
        .filter(definition => !existingIds.has(definition.id))
        .map(definition => ({
          ...definition,
          count: state.balanceRewardCounts[definition.id]
        }))
    ];
    let synergies = (Array.isArray(book.synergies) ? book.synergies : []).map(item => (
      item?.id === goldenTempoDefinition.id
        ? { ...item, ...goldenTempoDefinition, unlocked: state.rewardSynergies.includes(item.id) }
        : item
    ));
    if (!synergies.some(item => item?.id === goldenTempoDefinition.id)) {
      synergies.push({
        ...goldenTempoDefinition,
        unlocked: state.rewardSynergies.includes(goldenTempoDefinition.id)
      });
    }
    const history = Array.isArray(book.history)
      ? book.history
      : state.rewardBookHistory.slice().reverse();
    const maximum = Math.max(1, finiteNumber(book.maximum, 16));
    const progress = Number.isFinite(Number(book.progress))
      ? Number(book.progress)
      : Math.min(maximum, history.length + state.rewardSynergies.length);
    return {
      ...book,
      progress,
      maximum,
      history,
      synergies,
      customRewards
    };
  };
}());
/* UMT_CUDDLE_BALANCE_REFRESH_HARDMODE_V1: ENGINE END */
