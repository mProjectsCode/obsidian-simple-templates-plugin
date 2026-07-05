// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import no_relative_import_paths from 'eslint-plugin-no-relative-import-paths';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tsparser from '@typescript-eslint/parser';

export default defineConfig(globalIgnores(['**/*.test.ts']), ...obsidianmd.configs.recommended, {
	files: ['packages/**/*.ts'],
	languageOptions: {
		parser: tsparser,
		parserOptions: {
			project: './tsconfig.json',
		},
	},
	plugins: {
		'no-relative-import-paths': no_relative_import_paths,
	},
	rules: {
		'@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
		'@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
		'@typescript-eslint/no-explicit-any': 'warn',
		'@typescript-eslint/no-unused-vars': [
			'error',
			{ argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', varsIgnorePattern: '^_' },
		],
		curly: ['error', 'all'],
		'no-relative-import-paths/no-relative-import-paths': ['warn', { allowSameFolder: false }],
	},
});
