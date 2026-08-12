export default {
preset: "ts-jest/presets/default-esm",
testEnvironment: "node",
extensionsToTreatAsEsm: [".ts"],
moduleNameMapper: {
"^(.{1,2}/.*)\.js$": "$1"
},
transform: {
"^.+\.tsx?$": [
"ts-jest",
{
useESM: true,
tsconfig: "<rootDir>/tsconfig.json"
}
]
},
collectCoverageFrom: [
"src/**/*.ts",
"!src/**/**tests**/**",
"!src/types/**",
"!src/index.ts"
],
coverageDirectory: "coverage",
coverageReporters: [
"text",
"text-summary",
"lcov"
],
clearMocks: true,
restoreMocks: true,
verbose: true
};
