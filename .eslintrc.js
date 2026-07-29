module.exports = {
	env: {
		es2022: true,
		node: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended-type-checked',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2022,
		project: 'tsconfig.json',
		sourceType: 'module',
		tsconfigRootDir: __dirname,
	},
	plugins: ['@typescript-eslint', 'unicorn'],
	reportUnusedDisableDirectives: true,
	root: true,
	rules: {
		'no-magic-numbers': 'off',
		'no-process-exit': 'error',
		'sort-keys': ['error', 'asc', { caseSensitive: false, natural: true }],
		'unicorn/no-array-push-push': 'error',
		'unicorn/no-process-exit': 'error',
	},
};
