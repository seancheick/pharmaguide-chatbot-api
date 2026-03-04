function logGate(gate, messageLength, hasHistory) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[GATE] ${gate} | msgLen=${messageLength} | history=${hasHistory}`);
  }
}

module.exports = { logGate };
