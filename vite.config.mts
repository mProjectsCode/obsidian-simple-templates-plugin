import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createObsidianPluginConfig } from '@lemons_dev/lemons-obsidian-plugin-automation';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) =>
	createObsidianPluginConfig({
		root,
		mode,
		entry: 'packages/obsidian/src/main.ts',
		plugins: [],
		resolve: { alias: { packages: path.join(root, 'packages') } },
	}),
);
