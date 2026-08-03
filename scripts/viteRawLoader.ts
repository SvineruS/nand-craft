/**
 * Teaches Node the two Vite import forms this codebase uses, so game code can run outside the
 * bundler: `?raw` imports (gateSvg.ts pulls its gate shapes in that way), and asset imports,
 * which Vite turns into a url — `sfx.ts` names its sounds by importing the files.
 *
 * Loaded via `node --import ./scripts/viteRawLoader.ts <script>` so the hooks are
 * registered before the entry module resolves its imports.
 */

import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const RAW_SUFFIX = '?raw';

/** Extensions Vite serves as a url rather than as a module. */
const ASSET_EXTENSIONS = ['.wav', '.ogg', '.mp3', '.png', '.jpg', '.svg'];

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
    // An asset stands in as its own path, where Vite would hand back a hashed url. Nothing in
    // Node plays a sound; what matters is that importing one resolves, and that a check can see
    // whether the file behind the name is really there.
    if (ASSET_EXTENSIONS.some(ext => url.endsWith(ext))) {
      return {
        format: 'module',
        source: `export default ${JSON.stringify(fileURLToPath(url))};`,
        shortCircuit: true,
      };
    }

    if (!url.endsWith(RAW_SUFFIX)) return nextLoad(url, context);

    const text = readFileSync(fileURLToPath(url.slice(0, -RAW_SUFFIX.length)), 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(text)};`,
      shortCircuit: true,
    };
  },
});
