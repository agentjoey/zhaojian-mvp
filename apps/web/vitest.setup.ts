import "@testing-library/jest-dom/vitest";

/**
 * Node 22+ 内置了实验性全局 `localStorage`（由 `--localstorage-file` 落盘持久化）。
 * 在本仓库用的 vitest 2.1.x jsdom test environment 里 `window` 与 `globalThis`
 * 是同一个对象，Node 原生的 `localStorage` accessor 比 jsdom 自带实现先声明、
 * 优先生效；未配置 `--localstorage-file` 时它返回一个不含任何 Storage 方法
 * （getItem/setItem/clear 全缺）的桩对象，任何测试一碰 `localStorage.clear()`
 * 就会报 "localStorage.clear is not a function"——与被测代码是否正确无关，
 * 纯粹是 Node 版本与 vitest jsdom 环境的兼容性问题（`window.localStorage`
 * 命中的是同一个坏 accessor，读不到 jsdom 真实实现，绕不过去）。
 * 用一份符合 Storage 接口的最小内存实现强制覆盖回全局，保证所有测试
 * （含未来新增的）都能可靠读写 localStorage。
 */
function installLocalStoragePolyfill(): void {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

installLocalStoragePolyfill();
