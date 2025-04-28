(function () {
  // Ensure globalThis is available
  const globalObj = typeof globalThis !== "undefined" ? globalThis : window;

  // Polyfill process
  globalObj.process = globalObj.process || {
    env: {},
    nextTick: (callback, ...args) => setTimeout(() => callback(...args), 0),
    version: "v14.0.0",
    platform: "browser",
  };

  // Log for debugging
  console.log("Preload polyfills applied (process only)");
})();