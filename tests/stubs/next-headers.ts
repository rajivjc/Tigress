// In-memory shim for `next/headers` so Vitest can exercise data-layer
// functions that read the mock session cookie. Tests can mutate the
// `__mockCookies` map directly to simulate a signed-in user.

const store = new Map<string, string>();

export function __setMockCookie(name: string, value: string | null): void {
  if (value === null) {
    store.delete(name);
  } else {
    store.set(name, value);
  }
}

export function __clearMockCookies(): void {
  store.clear();
}

export function cookies(): {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
} {
  return {
    get(name: string) {
      const v = store.get(name);
      return v === undefined ? undefined : { value: v };
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}
