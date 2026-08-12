import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    collectCoverage: true,
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/index.ts"
    ]
};

export default config;
