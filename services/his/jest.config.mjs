export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  extensionsToTreatAsEsm: [".ts"],

  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "./tsconfig.json"
      }
    ]
  },

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },

testMatch: [
  "**/__tests__/**/*.test.ts",
  "**/?(*.)+(spec|test).ts"
],

  testPathIgnorePatterns: [
  "/node_modules/",
  "/dist/",
  "\\.d\\.ts$"
]
};