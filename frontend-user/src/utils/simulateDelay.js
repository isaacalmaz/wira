// Simulasi delay API
export const simulateDelay = (ms = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
