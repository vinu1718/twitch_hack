import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export const tick = () => new Promise((resolve) => setImmediate(resolve));
export function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    const filename = resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const localRequire = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(filename), id);
        const source = ['.ts', '.tsx', ''].map((ext) => base + ext).find(existsSync);
        if (source) return load(source);
      }
      return require(id);
    };
    const context = vm.createContext({ module: loaded, exports: loaded.exports, require: localRequire,
      console, process, Buffer, URL, URLSearchParams, Response, Request, Headers, AbortSignal,
      structuredClone, setTimeout, clearTimeout, setInterval: () => ({ unref() {} }), clearInterval,
      ...globals });
    new vm.Script(code, { filename }).runInContext(context);
    return loaded.exports;
  }
  return load;
}
export class Clock {
  now = Date.now();
  tasks = new Map();
  nextId = 1;
  globals() {
    const now = () => this.now;
    return {
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now()])); } static now() { return now(); } },
      setTimeout: (fn, ms) => { const timer = { id: this.nextId++, unref() {} }; this.tasks.set(timer.id, { fn, at: this.now + ms, timer }); return timer; },
      clearTimeout: (timer) => { this.tasks.delete(timer?.id); },
    };
  }
  async advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks.values()].filter((task) => task.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.now = next.at; this.tasks.delete(next.timer.id); next.fn();
      await tick();
    }
    this.now = end; await tick();
  }
}
export class Socket {
  static instances = [];
  listeners = new Map();
  constructor(url) { this.url = url; Socket.instances.push(this); }
  addEventListener(name, fn) { const fns = this.listeners.get(name) || []; fns.push(fn); this.listeners.set(name, fns); }
  emit(name, data = {}) { for (const fn of this.listeners.get(name) || []) fn(data); }
  message(type, payload, id = String(Math.random())) { this.emit('message', { data: JSON.stringify({ metadata: { message_type: type, message_id: id }, payload }) }); }
  welcome(id) { this.message('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } }); }
  close() { if (this.closed) return; this.closed = true; this.emit('close'); }
}
