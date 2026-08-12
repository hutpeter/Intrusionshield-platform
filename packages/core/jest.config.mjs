export default {
    rootDir: ".",

    testEnvironment: "node",

    extensionsToTreatAsEsm: [".ts"],

    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: "<rootDir>/tsconfig.json"
            }
        ]
    },

    testMatch: [
        "<rootDir>/src/**/*.test.ts"
    ],

    testPathIgnorePatterns: [
        "/node_modules/",
        "/dist/"
    ],

    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/*.test.ts"
    ],

    coveragePathIgnorePatterns: [
        "/node_modules/",
        "/dist/",
        "/src/**/__tests__/"
    ],

    moduleFileExtensions: [
        "ts",
        "tsx",
        "js",
        "mjs"
    ],

    clearMocks: true
};