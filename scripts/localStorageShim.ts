/**
 * In-memory localStorage for running simulation code under Node.
 *
 * componentRegistry.ts calls loadAllComponents() at module-init time, which touches
 * localStorage. ESM evaluates imports in order, so this module must be imported
 * *first* in any script that transitively reaches componentRegistry.
 */

class MemoryStorage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

// Node declares `localStorage` as a global but leaves it undefined unless
// --experimental-webstorage is on, so presence alone isn't enough to test for.
function hasWorkingStorage(): boolean {
  try {
    return typeof (globalThis as { localStorage?: Storage }).localStorage?.getItem === 'function';
  } catch {
    return false;
  }
}

if (!hasWorkingStorage()) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

export {};
