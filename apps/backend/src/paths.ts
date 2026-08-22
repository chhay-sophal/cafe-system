import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Walks up from this module's own location to find apps/backend's
// package.json. A fixed number of '..' segments would be wrong here: tsup
// bundles this file into a single dist/index.js, which sits at a shallower
// depth than the src/ file this code was originally written in, so any
// hardcoded relative traversal correct for one is wrong for the other.
function findBackendRoot(startDir: string): string {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate apps/backend package root (no package.json found)');
    }
    dir = parent;
  }
  return dir;
}

export const backendRoot = findBackendRoot(path.dirname(fileURLToPath(import.meta.url)));
