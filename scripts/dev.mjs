// Runs the server (restarting on changes) and the Angular dev server together.
// The dev server proxies /ws and /config.json to the server, so the app
// at http://localhost:4200 connects to it automatically.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tasks = [
  { name: 'server', color: 36, args: ['run', 'dev', '--prefix', 'server'] },
  { name: 'client', color: 35, args: ['start', '--prefix', 'client'] },
];

const children = tasks.map(({ name, color, args }) => {
  const child = spawn(npm, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NG_CLI_ANALYTICS: 'false', FORCE_COLOR: '1' },
    shell: process.platform === 'win32',
  });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => console.log(prefix + line));
  }
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    stop(code ?? 1);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
