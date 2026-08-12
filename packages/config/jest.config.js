/** @type {import("jest").Config} */
const config = {
    preset: "ts-jest/presets/default-esm",

    testEnvironment: "node",

    rootDir: ".",

    roots: [
        "<rootDir>/src"
    ],

    testMatch: [
        "<rootDir>/src/**/__tests__/**/*.test.ts",
        "<rootDir>/src/**/*.(spec|test).ts"
    ],

    extensionsToTreatAsEsm: [
        ".ts"
    ],

    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: "<rootDir>/tsconfig.json"
            }
        ]
    },

    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    },

    collectCoverageFrom: [
        "<rootDir>/src/**/*.ts",
        "!<rootDir>/src/**/__tests__/**",
        "!<rootDir>/src/types/**",
        "!<rootDir>/src/index.ts"
    ],

    coverageDirectory: "<rootDir>/coverage",

    coverageReporters: [
        "text",
        "text-summary",
        "lcov"
    ],

    clearMocks: true,

    restoreMocks: true,

    verbose: true
};

export default config;