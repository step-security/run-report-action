import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	js.configs.recommended,
	{
		extends: [tseslint.configs.recommendedTypeChecked],
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		languageOptions: {
			ecmaVersion: 2022,
			globals: {
				...globals.es2022,
				...globals.node,
			},
			sourceType: 'module',
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
		},
		plugins: {
			unicorn: unicornPlugin,
		},
		rules: {
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'no-magic-numbers': 'off',
			'sort-keys': ['error', 'asc', { caseSensitive: false, natural: true }],
			'unicorn/no-array-push-push': 'error',
			'unicorn/no-process-exit': 'error',
		},
	},
	prettierConfig,
	{
		ignores: ['coverage/**', 'dist/**', 'node_modules/**', '*.min.js', '*.map', '*.snap'],
	},
);
