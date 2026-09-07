import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    collectCoverage: true,
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/index.ts"
    ],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    }
};

export default config;