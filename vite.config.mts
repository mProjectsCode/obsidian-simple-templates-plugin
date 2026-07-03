import { getBuildBanner } from '@lemons_dev/lemons-obsidian-plugin-automation';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';
import banner from 'vite-plugin-banner';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import manifest from './manifest.json' with { type: 'json' };

const entryFile = 'packages/obsidian/src/main.ts';

export default defineConfig(({ mode }) => {
	const prod = mode === 'production';
	const outDir = prod ? 'dist' : `exampleVault/.obsidian/plugins/${manifest.id}`;

	return {
		plugins: [
			banner({
				outDir,
				content: getBuildBanner(prod ? 'Release Build' : 'Dev Build', version => version),
			}),
			viteStaticCopy({
				targets: [{ src: 'manifest.json', dest: '.' }],
			}),
		],
		resolve: {
			alias: {
				packages: path.resolve(import.meta.dirname, './packages'),
			},
		},
		build: {
			lib: {
				entry: path.resolve(import.meta.dirname, entryFile),
				name: 'main',
				fileName: () => 'main.js',
				formats: ['cjs'],
			},
			minify: prod,
			target: 'es2022',
			sourcemap: prod ? false : 'inline',
			cssCodeSplit: false,
			emptyOutDir: prod,
			outDir,
			rolldownOptions: {
				input: {
					main: path.resolve(import.meta.dirname, entryFile),
				},
				output: {
					entryFileNames: 'main.js',
					assetFileNames: 'styles.css',
				},
				external: [
					'obsidian',
					'electron',
					'@codemirror/autocomplete',
					'@codemirror/collab',
					'@codemirror/commands',
					'@codemirror/language',
					'@codemirror/lint',
					'@codemirror/search',
					'@codemirror/state',
					'@codemirror/view',
					'@lezer/common',
					'@lezer/highlight',
					'@lezer/lr',
					...builtinModules,
				],
			},
		},
	} satisfies UserConfig;
});
