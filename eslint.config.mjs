// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import no_relative_import_paths from 'eslint-plugin-no-relative-import-paths';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default defineConfig(
	{
		ignores: ['node_modules/', 'exampleVault/', 'dist/', 'main.js'],
	},
	{
		files: ['packages/**/*.ts'],
		extends: [
			eslint.configs.recommended,
			...tseslint.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
			...tseslint.configs.stylisticTypeChecked,
			...obsidianmd.configs.recommended,
		],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: true,
			},
		},
		plugins: {
			'no-relative-import-paths': no_relative_import_paths,
			obsidianmd,
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
			'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'no-relative-import-paths/no-relative-import-paths': ['warn', { allowSameFolder: false }],
		},
	},
	{
		files: ['packages/**/tests/**/*.ts'],
		languageOptions: {
			globals: { Bun: 'readonly' },
		},
		rules: {
			'@typescript-eslint/no-empty-function': 'off',
			'no-relative-import-paths/no-relative-import-paths': 'off',
		},
	},
);
