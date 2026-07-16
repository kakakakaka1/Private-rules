import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployConfigPath = path.join(projectRoot, 'dist', 'private_rules', 'wrangler.json');

const source = await readFile(deployConfigPath, 'utf8');
const config = JSON.parse(source);

// The Cloudflare Vite plugin redirects Wrangler to this generated file and
// currently does not carry the top-level keep_vars option across automatically.
config.keep_vars = true;

await writeFile(deployConfigPath, `${JSON.stringify(config)}\n`, 'utf8');
console.log('Prepared Cloudflare deploy config with keep_vars=true.');
