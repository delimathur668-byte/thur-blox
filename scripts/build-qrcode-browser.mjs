import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const outputFile = join(root, 'assets', 'vendor', 'qrcode-browser.js');
const entryFile = join(root, 'node_modules', 'qrcode', 'lib', 'browser.js');

const normalizeId = (filePath) => relative(root, filePath).replace(/\\/g, '/');

const resolveRequiredFile = (fromFile, request) => {
  if (request === 'fs') return null;
  if (request === 'dijkstrajs') {
    return join(root, 'node_modules', 'dijkstrajs', 'dijkstra.js');
  }
  if (request.startsWith('.')) {
    const base = resolve(dirname(fromFile), request);
    return extname(base) ? base : `${base}.js`;
  }
  throw new Error(`Dependencia CommonJS nao mapeada no bundle QR: ${request}`);
};

const modules = new Map();

const collectModule = async (filePath) => {
  if (!filePath) return null;
  const id = normalizeId(filePath);
  if (modules.has(id)) return id;

  let source = await readFile(filePath, 'utf8');
  const dependencies = [];
  source = source.replace(/require\(['"]([^'"]+)['"]\)/g, (match, request) => {
    const dependencyFile = resolveRequiredFile(filePath, request);
    if (!dependencyFile) return 'null';
    const dependencyId = normalizeId(dependencyFile);
    dependencies.push(dependencyFile);
    return `require(${JSON.stringify(dependencyId)})`;
  });
  modules.set(id, source);
  for (const dependency of dependencies) {
    await collectModule(dependency);
  }
  return id;
};

const entryId = await collectModule(entryFile);
const moduleEntries = [...modules.entries()]
  .map(([id, source]) => `${JSON.stringify(id)}: function(require, module, exports) {\n${source}\n}`)
  .join(',\n');

const bundle = `/* Generated from the qrcode npm package for static browser deploys. */\n(function () {\n  const modules = {\n${moduleEntries}\n  };\n  const cache = {};\n  function require(id) {\n    if (cache[id]) return cache[id].exports;\n    if (!modules[id]) throw new Error('Modulo QR ausente: ' + id);\n    const module = { exports: {} };\n    cache[id] = module;\n    modules[id](require, module, module.exports);\n    return module.exports;\n  }\n  window.QRCode = require(${JSON.stringify(entryId)});\n})();\n`;

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, bundle);
console.log('Bundle QR Code browser gerado em assets/vendor/qrcode-browser.js');
