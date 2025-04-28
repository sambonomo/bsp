import crypto from "crypto-browserify";
import stream from "stream-browserify";
import assert from "assert";
import process from "process";
import util from "util";
import { Buffer } from "buffer";
import vm from "vm-browserify";

// Ensure globalThis is available
const globalObj = typeof globalThis !== "undefined" ? globalThis : window;

// Polyfill Node.js APIs for Firebase
globalObj.global = globalObj;
globalObj.process = process;

// Use a custom global for crypto to avoid overwriting window.crypto
if (!globalObj.nodeCrypto) {
  globalObj.nodeCrypto = crypto;
}

globalObj.Buffer = Buffer;
globalObj.stream = stream;
globalObj.assert = assert;
globalObj.util = util;
globalObj.vm = vm;

// Ensure process.env is defined for modules that check it
if (!globalObj.process.env) {
  globalObj.process.env = {};
}

// Additional process properties for compatibility
globalObj.process.nextTick = (callback, ...args) => setTimeout(() => callback(...args), 0);
globalObj.process.version = "v14.0.0";
globalObj.process.platform = "browser";

console.log("Polyfills loaded for Firebase compatibility (via index.js)");