// Stand-in for next/headers in the local auth tests. cookies() returns the jar the test selected with
// globalThis.__authLocalJar (a Map of name -> value), so each simulated browser keeps its own session cookies.
function jar() {
  if (!globalThis.__authLocalJar) throw new Error("auth-local: no cookie jar selected");
  return globalThis.__authLocalJar;
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
