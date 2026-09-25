// Rare secrets for Cuddle's "Rare Word" challenge (cuddle-rebalance-v5.js).
//
// Real but uncommon English words: every one is a valid guess
// (server/wordlists/allowed_guesses_modern.txt) but never an ordinary
// secret (allowed_secrets.txt). Picked by hand from the mid-frequency band
// of allowed_words_modern.txt -- recognisable, unusual, fair to deduce --
// leaving out names, brands, foreign words, plurals and anything
// offensive. The near-gibberish in excluded_rare_or_obsolete_guesses.txt
// is deliberately not used.
(function () {
  "use strict";
  window.CuddleRareWords = Object.freeze([
    "ALEPH", "ALGAL", "ALKYL", "ALVAR", "AMIDE", "AMINE", "ANION", "AREAL", "ARETE", "ATMAN", "AUGHT", "AURUM",
    "AUXIN", "BASSO", "BIGHT", "BLEST", "BOMBE", "BRANE", "BREVE", "BUTYL", "CALLA", "CALYX", "CANTO", "CAUDA",
    "CEIBA", "CHELA", "CHERT", "CHINE", "CLARY", "CODON", "CONEY", "COTTA", "CRAKE", "CREEL", "CULEX", "DEISM",
    "DERMA", "DICTA", "DIMER", "DJINN", "DOLOR", "DORIC", "DOWER", "DRYAD", "DUCAL", "DURUM", "ELAND", "ELVEN",
    "EMMET", "ENROL", "ERGOT", "ESKER", "FICHE", "FLUOR", "FORAM", "FOSSE", "GAULT", "GEOID", "GHAST", "GHYLL",
    "GLEBE", "GLIAL", "GLUON", "GREBE", "HALLO", "HALON", "HEALD", "HENGE", "HOSTA", "ILEUM", "IMAGO", "INFIX",
    "INGLE", "JUNCO", "KAPOK", "KARST", "KAURI", "KETCH", "KYLIX", "LAIRD", "LAVER", "LIANA", "LIDAR", "LIVRE",
    "LOACH", "LOCUM", "LOSSY", "LUPIN", "LYASE", "MANTA", "MASER", "MATIN", "MIMEO", "MINKE", "MITRE", "MOIRE",
    "MONAD", "MOTTE", "MUFTI", "NONCE", "OATEN", "ODOUR", "OHMIC", "ORIEL", "OUTRO", "PEASE", "PHLOX", "PIEZO",
    "PIPIT", "PITTA", "PRANA", "QUINT", "QUIRE", "RADIX", "RAMIE", "RECTO", "REDOX", "RIYAL", "RONDO", "RUMEN",
    "RUNIC", "SABOT", "SEDUM", "SEPTA", "SIBYL", "SIGIL", "SISAL", "SKINK", "SMOLT", "SNOOK", "SPAKE", "SPOOR",
    "SPRUE", "STIPE", "STUPA", "STYLI", "SUMMA", "TABLA", "TAKIN", "TANKA", "TELEX", "TENON", "TESTA", "THANE",
    "THERM", "THIOL", "THUJA", "TINEA", "TITRE", "TONNE", "TOQUE", "TORIC", "TORII", "TRINE", "UNARY", "VEENA",
    "VETCH", "VINCA", "VIREO", "VOCAB", "VOXEL", "WEALD", "XYLEM", "YOGIC", "ZLOTY"
  ]);
})();
