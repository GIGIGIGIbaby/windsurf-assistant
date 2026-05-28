/**
 * test/build-test.mjs — 把 test/cascade-e2e.ts 打包为可运行的 Node CJS
 *
 * 反者道之动: 用 esbuild stub 掉 `vscode` 模块, 让 cascade/* 纯函数可在 Node 直接跑
 */
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const vscodeStub = `
exports.window = {
  createOutputChannel: (name) => ({
    appendLine: (s) => console.log('[' + name + '] ' + s),
    append: (s) => process.stdout.write(s),
    show: () => {},
    dispose: () => {}
  }),
  showQuickPick: async (items) => Array.isArray(items) ? items[0] : undefined,
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => '允许',
  showInputBox: async () => 'test input'
};
exports.workspace = {
  workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
  getConfiguration: () => ({ get: (k, d) => d, update: async () => {} }),
  onDidChangeConfiguration: (cb) => ({ dispose: () => {} })
};
exports.env = {
  openExternal: async () => true
};
exports.Uri = {
  parse: (s) => ({ fsPath: s, toString: () => s })
};
exports.ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
exports.CancellationTokenSource = function () {
  this.token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
  this.cancel = () => { this.token.isCancellationRequested = true; };
  this.dispose = () => {};
};
`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(__dirname, 'cascade-e2e.ts')],
  bundle: true,
  outfile: path.join(__dirname, 'dist', 'cascade-e2e.cjs'),
  format: 'cjs',
  platform: 'node',
  target: 'node22',
  sourcemap: 'inline',
  logLevel: 'warning',
  plugins: [{
    name: 'vscode-stub',
    setup(build) {
      build.onResolve({ filter: /^vscode$/ }, () => ({
        path: 'vscode-stub',
        namespace: 'vscode-stub'
      }));
      build.onLoad({ filter: /.*/, namespace: 'vscode-stub' }, () => ({
        contents: vscodeStub,
        loader: 'js'
      }));
    }
  }]
});
console.log('[test/build] ok → test/dist/cascade-e2e.cjs');
