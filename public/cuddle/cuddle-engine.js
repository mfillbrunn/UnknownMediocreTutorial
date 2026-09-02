// public/cuddle/cuddle-engine.js
// Pure client-side rules and persistence for the Cuddle single-player campaign.
(function () {
  "use strict";

  const VERSION = 1;
  const STORAGE_KEY = "vowelPlay.cuddle.v1";
  // Cumulative score gates, one per SCORING round -- boss rounds sit between
  // them and are pass/fail, so they neither score nor need a gate. Nine
  // scoring rounds plus the three bosses below is twelve rounds played.
  const THRESHOLDS = Object.freeze([25, 50, 75, 110, 140, 170, 200, 250, 300]);
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

  // Bosses break the nine scoring rounds into groups of three: scoring rounds
  // 1-3, boss, 4-6, boss, 7-9, then the final boss. They are pass/fail -- no
  // score, no threshold -- but clearing one grants an ordinary reward AND the
  // boss's own permanent upgrade.
  const BOSS_BEFORE_ROUNDS = Object.freeze([4, 7]);

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
      state.buffs = { greyShield: 0, ...(state.buffs || {}) };
      state.serial = Number.isFinite(state.serial) ? state.serial : 0;
      state.maxGuesses = MAX_GUESSES;
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
      const turns = Number(boss.turns) || 0;
      return this.state.guessesUsed < turns;
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
          // nothing seen here can be trusted or learned from.
          const shown = feedback.map(() => {
            const roll = this.random();
            return roll < 0.34 ? "green" : roll < 0.67 ? "yellow" : "grey";
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
      this._prepareInitialHand();

      const deferred = state.deferredRewards.slice();
      state.deferredRewards = [];
      const messages = [];
      deferred.forEach(rewardId => {
        const message = this._applyRewardEffect(rewardId);
        if (message) messages.push(message);
      });
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
      if (this.state.guessesUsed >= MAX_GUESSES) return { ok: false, error: "No guesses remain." };

      const word = validation.word;
      const feedback = evaluateFeedback(this.state.secret, word);
      const yellowCount = feedback.filter(result => result === "yellow").length;
      const greenCount = feedback.filter(result => result === "green").length;
      const greyCount = feedback.filter(result => result === "grey").length;
      const shielded = this.state.buffs.greyShield > 0;
      // Greys are informational and never reduce the Cuddle score. Boss
      // rounds are pass/fail, so nothing scores in them at all.
      const bonus = this.state.upgrades.yellowPoints;
      const scoreDelta = this.isBossRound()
        ? 0
        : yellowCount * (YELLOW_POINTS + bonus) + greenCount * (GREEN_POINTS + bonus);
      if (shielded) this.state.buffs.greyShield -= 1;

      const activeQuest = this.state.activeQuest;
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
          : Math.max(0, Number(this.state.mulligansLeft) || 0) * UNUSED_MULLIGAN_POINTS;
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
      } else if (this.state.guessesUsed >= MAX_GUESSES) {
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
        if (released) this._syncInfiniteCards();
      }

      const scoreParts = [];
      if (yellowCount) scoreParts.push(`${yellowCount} yellow`);
      if (greenCount) scoreParts.push(`${greenCount} green`);
      if (greyCount) scoreParts.push(`${greyCount} grey${greyCount === 1 ? "" : "s"}, no penalty`);
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
      if (nextGuess > MAX_GUESSES) return;
      const cadence = Math.max(1, 3 - this.state.upgrades.questCadence);
      if (nextGuess < cadence || nextGuess % cadence !== 0) return;
      const feasibleWords = this.getFeasibleWords();
      this.state.activeQuest = window.CuddleQuestBook?.createQuest({
        feasibleWords,
        secret: this.state.secret,
        history: this.state.history,
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
        case "revealGreen": {
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
          return `Position ${index + 1} is ${letter}; ${glyphForLetter(letter)} now stays in hand.`;
        }
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
        this.state.failureReason = this.isBossRound()
          ? `The ${this.state.boss.title} boss kept ${pending.secret} hidden for all six guesses.`
          : `You did not find ${pending.secret} in six guesses.`;
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
      this.state.boss = null;
      this.state.bossesCleared += 1;
      this.state.unknownGlyphs = [];
      // Marks the gate as resolved so _advanceRound drops into the round it
      // was guarding instead of offering the same boss again.
      this.state.bossGatesDone = unique([...(this.state.bossGatesDone || []), boss?.gate].filter(Boolean));
      this.state.lastClearedBossGate = boss?.gate || null;

      const rewardMessage = this._applyBossReward(boss?.rewardId);

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
      if (this.state.guessesUsed >= MAX_GUESSES) return { ok: false, error: "No guesses remain." };

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

      if (this.state.guessesUsed >= MAX_GUESSES) {
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
      // Bosses gate entry to scoring rounds 4 and 7.
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
    // announces its own constraint, and the Free Vowel Sweep reward appends
    // the letter it just tested for free. Only the plain round line is
    // regenerated here.
    const alreadySaid = String(this.state.lastMessage || "");
    if (!this.isBossRound() && !alreadySaid.includes("Free vowel sweep")) {
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
      const pool = this._baseDeckGlyphs().filter(glyph => !this.isInfiniteGlyph(glyph));
      const added = [];
      for (let i = 0; i < 3 && pool.length; i += 1) {
        const glyph = pool[Math.floor(this.random() * pool.length)];
        const card = this._newCard(glyph, "extra");
        this.state.hand.push(card);
        added.push(glyph);
      }
      return added.length
        ? `Extra Letters: ${added.join(", ")} added for this turn.`
        : "No extra letters were available to add.";
    }

    // Quest Value stacks: every pick makes quests worth another 5 points.
    if (rewardId === "questValue") {
      this.state.upgrades.questPoints = (Number(this.state.upgrades.questPoints) || 0)
        + QUEST_POINTS_PER_PICK;
      return `Quests are now worth ${this.state.upgrades.questPoints} points.`;
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
