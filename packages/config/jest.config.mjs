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
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    },
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/*.test.ts",
        "!src/types/**",
        "!src/index.ts"
    ],
    coverageDirectory: "coverage",
    coverageReporters: [
        "text",
        "text-summary",
        "lcov"
    ],
    moduleFileExtensions: [
        "ts",
        "tsx",
        "js",
        "mjs"
    ],
    clearMocks: true,
    restoreMocks: true,
    verbose: true
};
