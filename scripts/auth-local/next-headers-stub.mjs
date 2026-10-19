// Stand-in for next/headers in the local auth tests. cookies() returns the jar of the request being handled (a Map of
// name -> value), so each simulated browser keeps its own session cookies. The harness runs each request inside
// globalThis.__authLocalStore (AsyncLocalStorage), so requests sent AT THE SAME TIME never see each other's cookies;
// globalThis.__authLocalJar is the fallback for code that sets a jar directly.
function jar() {
  const current = globalThis.__authLocalStore?.getStore() ?? globalThis.__authLocalJar;
  if (!current) throw new Error("auth-local: no cookie jar selected");
  return current;
}

export async function cookies() {
  return {
    getAll: () => [...jar()].map(([name, value]) => ({ name, value })),
    get: (name) => (jar().has(name) ? { name, value: jar().get(name) } : undefined),
    has: (name) => jar().has(name),
    set: (name, value, options) => {
      if (value === "" || options?.maxAge === 0) jar().delete(name);
      else jar().set(name, value);
    },
    delete: (name) => jar().delete(name),
  };
}

export async function headers() {
  return new Headers();
}
