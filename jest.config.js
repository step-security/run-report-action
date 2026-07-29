module.exports = {
	collectCoverage: false,
	coverageDirectory: './coverage',
	coverageReporters: ['lcov', 'text-summary'],
	globals: {
		__DEV__: true,
		__PROD__: true,
		__TEST__: true,
	},
	moduleFileExtensions: ['ts', 'tsx', 'cts', 'mts', 'js', 'jsx', 'cjs', 'mjs', 'json', 'node'],
	testEnvironment: 'node',
	testMatch: ['**/{tests,__tests__}/**/*.test.{ts,tsx,cts,mts,js,jsx,cjs,mjs}'],
	testRunner: 'jest-circus/runner',
	transform: {
		'\\.(ts|tsx|cts|mts|js|jsx|cjs|mjs)$': 'babel-jest',
	},
};
