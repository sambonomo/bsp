module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        // Node.js globals
        process: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // ES2021 globals
        Promise: "readonly",
        Set: "readonly",
        Map: "readonly",
        WeakSet: "readonly",
        WeakMap: "readonly",
        Symbol: "readonly",
        BigInt: "readonly",
        globalThis: "readonly",
      },
    },
    plugins: {},
    rules: {
      "no-restricted-globals": ["error", "name", "length"],
      "prefer-arrow-callback": "error",
      "quotes": ["error", "double", { "allowTemplateLiterals": true }],
    },
  },
  {
    files: ["**/*.spec.*"],
    languageOptions: {
      globals: {
        // Mocha globals
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {},
  },
];
