/** Build-on-change fallback for Astro's Windows dev module-runner issue. */
import { watch } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'astro';

const { values } = parseArgs({ options: { host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '4321' } } });
const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = fileURLToPath(new URL('../.preview/', import.meta.url));
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be between 1 and 65535');
let server;
let timer;
let building = false;
let dirty = false;
let stopping = false;

async function rebuild() {
  dirty = true;
  if (building || stopping) return;
  building = true;
  while (dirty && !stopping) {
    dirty = false;
    try {
      await build({ root, outDir, logLevel: 'warn' });
      if (stopping) break;
      server ??= await preview({ root, outDir, server: { host: values.host, port }, logLevel: 'warn' });
      if (stopping) { await server.stop(); break; }
      console.log(`Preview ready: http://${values.host}:${port}/ — refresh after changes.`);
    } catch (error) { console.error(error); }
  }
  building = false;
}
function schedule() { clearTimeout(timer); timer = setTimeout(rebuild, 180); }
const watchers = ['src', 'public'].map((dir) => watch(new URL(`../${dir}/`, import.meta.url), { recursive: true }, schedule));
watchers.push(watch(root, (_, filename) => {
  if (filename && ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json'].includes(String(filename))) schedule();
}));
async function stop() {
  if (stopping) return;
  stopping = true; clearTimeout(timer); watchers.forEach((watcher) => watcher.close());
  await server?.stop();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
await rebuild();
