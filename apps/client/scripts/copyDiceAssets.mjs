import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '..', '..');

const CANDIDATE_SOURCE_DIRS = [
  path.join(clientRoot, 'node_modules', '@3d-dice', 'dice-box', 'dist', 'assets'),
  path.join(clientRoot, 'node_modules', '@3d-dice', 'dice-box', 'src', 'assets'),
  path.join(repoRoot, 'node_modules', '@3d-dice', 'dice-box', 'dist', 'assets'),
  path.join(repoRoot, 'node_modules', '@3d-dice', 'dice-box', 'src', 'assets'),
];

const ASSET_CATEGORIES = ['ammo', 'fonts', 'meshes', 'themes'];

/**
 * Copies @3d-dice/dice-box static assets (ammo, fonts, meshes, themes) into
 * apps/client/public/assets/dice-box/ so Vite serves and bundles them under /assets/dice-box/.
 */
export function copyDiceAssets() {
  const sourceDir = CANDIDATE_SOURCE_DIRS.find((dir) => fs.existsSync(dir));
  if (!sourceDir) {
    throw new Error(
      `Unable to locate @3d-dice/dice-box assets directory. Checked:\n${CANDIDATE_SOURCE_DIRS.join('\n')}`
    );
  }

  const targetDir = path.join(clientRoot, 'public', 'assets', 'dice-box');
  fs.mkdirSync(targetDir, { recursive: true });

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const copied = [];

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);

    if (entry.isDirectory() || ASSET_CATEGORIES.includes(entry.name) || entry.isFile()) {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      copied.push(entry.name);
    }
  }

  return { sourceDir, targetDir, copied };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase();

if (isDirectExecution) {
  const result = copyDiceAssets();
  console.log(
    `[copyDiceAssets] Copied [${result.copied.join(', ')}] from ${result.sourceDir} -> ${result.targetDir}`
  );
}
