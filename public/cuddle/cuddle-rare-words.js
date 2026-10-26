// Rare secrets for Cuddle's "Rare Word" challenge (cuddle-rebalance-v5.js).
//
// Real but uncommon English words: every one is a valid guess
// (server/wordlists/allowed_guesses_modern.txt) but never an ordinary
// secret (allowed_secrets.txt). Picked by hand from the mid-frequency band
// of allowed_words_modern.txt -- recognisable, unusual, fair to deduce --
// leaving out names, brands, foreign words, plurals and anything
// offensive. The near-gibberish in excluded_rare_or_obsolete_guesses.txt
// is deliberately not used.
//
// Listed most common first (the Frequency column of allowed_words.txt):
// Standard's Rare Word stages draw from the more familiar part of the
// list, Hard's from all of it (cuddle-word-frequency.js).
(function () {
  "use strict";
  window.CuddleRareWords = Object.freeze([
    "TONNE", "TELEX", "LAIRD", "ENROL", "FICHE", "BUTYL", "CODON", "MITRE", "DOLOR", "ALEPH", "AMINE", "SPAKE",
    "TORIC", "TITRE", "ZLOTY", "LIVRE", "ODOUR", "CANTO", "ALKYL", "CALLA", "REDOX", "CONEY", "PEASE", "MANTA",
    "SUMMA", "ELVEN", "LUPIN", "HALLO", "RADIX", "STYLI", "ALGAL", "COTTA", "ANION", "THERM", "BRANE", "DIMER",
    "PRANA", "EMMET", "THANE", "TABLA", "RIYAL", "LIDAR", "VOCAB", "LOSSY", "GLUON", "BASSO", "NONCE", "KARST",
    "PIEZO", "TAKIN", "CHINE", "GLEBE", "MOTTE", "OUTRO", "GREBE", "RONDO", "FLUOR", "HOSTA", "LYASE", "AMIDE",
    "KYLIX", "QUINT", "GLIAL", "IMAGO", "HEALD", "TRINE", "UNARY", "SNOOK", "CLARY", "VIREO", "AREAL", "TESTA",
    "SISAL", "DERMA", "BREVE", "LOCUM", "ESKER", "INGLE", "BIGHT", "CALYX", "MONAD", "MIMEO", "VOXEL", "LAVER",
    "CREEL", "FOSSE", "PHLOX", "GAULT", "RUMEN", "MATIN", "ORIEL", "AUGHT", "MUFTI", "SEPTA", "FORAM", "TENON",
    "LIANA", "OATEN", "DURUM", "STIPE", "DJINN", "RUNIC", "RECTO", "THIOL", "HALON", "ARETE", "DOWER", "ILEUM",
    "MASER", "ATMAN", "KAPOK", "LOACH", "INFIX", "DICTA", "KETCH", "WEALD", "GHAST", "BLEST", "TOQUE", "ELAND",
    "AUXIN", "XYLEM", "VETCH", "QUIRE", "TANKA", "TINEA", "AURUM", "DUCAL", "SABOT", "CEIBA", "YOGIC", "BOMBE",
    "VINCA", "KAURI", "SPOOR", "HENGE", "CHERT", "PIPIT", "SEDUM", "DORIC", "GHYLL", "MINKE", "DRYAD", "CAUDA",
    "SIGIL", "STUPA", "TORII", "OHMIC", "PITTA", "THUJA", "SIBYL", "SMOLT", "MOIRE", "SPRUE", "JUNCO", "CRAKE",
    "CHELA", "VEENA", "ALVAR", "DEISM", "GEOID", "SKINK", "RAMIE", "ERGOT", "CULEX"
  ]);
})();
