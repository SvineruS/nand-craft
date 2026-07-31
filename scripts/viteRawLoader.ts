/**
 * Teaches Node how to load Vite's `?raw` imports (gateSvg.ts pulls its gate shapes in
 * that way), so simulation code can run outside the bundler.
 *
 * Loaded via `node --import ./scripts/viteRawLoader.ts <script>` so the hooks are
 * registered before the entry module resolves its imports.
 */

import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const RAW_SUFFIX = '?raw';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.endsWith(RAW_SUFFIX)) return nextResolve(specifier, context);

    const bare = specifier.slice(0, -RAW_SUFFIX.length);
    const parentDir = context.parentURL
      ? dirname(fileURLToPath(context.parentURL))
      : process.cwd();
    const target = resolvePath(parentDir, bare);
    return {
      url: pathToFileURL(target).href + RAW_SUFFIX,
      format: 'module',
      shortCircuit: true,
    };
  },

  load(url, context, nextLoad) {
    if (!url.endsWith(RAW_SUFFIX)) return nextLoad(url, context);

    const text = readFileSync(fileURLToPath(url.slice(0, -RAW_SUFFIX.length)), 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  },
});
