function eloDelta(rA, rB, scoreA, k = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  return Math.round(k * (scoreA - expectedA));
}

module.exports = {
  eloDelta
};
