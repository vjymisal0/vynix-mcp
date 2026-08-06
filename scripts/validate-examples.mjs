import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const configDir = join(process.cwd(), 'examples', 'configs');
const files = (await readdir(configDir)).filter((name) => name.endsWith('.json'));

let failed = 0;

for (const file of files) {
  const path = join(configDir, file);
  const raw = await readFile(path, 'utf8');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file}: invalid JSON (${String(error)})`);
    continue;
  }

  const root = parsed.mcpServers ?? parsed.servers;
  if (!root || typeof root !== 'object' || !root.vynix) {
    failed += 1;
    console.error(`FAIL ${file}: missing vynix server block`);
    continue;
  }

  const entry = root.vynix;
  const hasCommand = typeof entry.command === 'string' && entry.command.length > 0;
  const hasArgs = Array.isArray(entry.args) && entry.args.length > 0;

  if (!hasCommand || !hasArgs) {
    failed += 1;
    console.error(`FAIL ${file}: command/args are required`);
    continue;
  }

  const flattenedArgs = entry.args.join(' ');
  if (!flattenedArgs.includes('@usevynix/mcp-server')) {
    failed += 1;
    console.error(`FAIL ${file}: expected @usevynix/mcp-server in args`);
    continue;
  }

  console.log(`PASS ${file}`);
}

if (failed > 0) {
  console.error(`\n${failed} example config file(s) failed validation`);
  process.exit(1);
}

console.log(`\nValidated ${files.length} example config file(s)`);
