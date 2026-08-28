/**
 * The one place MM-Website talks to MM-Scorekeeper's Python backend
 * (maroon-masters-python-api). Every call carries PYTHON_API_SECRET, the same
 * shared-secret trust model appscript/write-scores.gs uses for the Sheet — the
 * caller has already verified identity via Supabase before this is ever called.
 */
export async function callPythonApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = process.env.PYTHON_API_URL;
  const secret = process.env.PYTHON_API_SECRET;
  if (!baseUrl) throw new Error("PYTHON_API_URL is not configured.");
  if (!secret) throw new Error("PYTHON_API_SECRET is not configured.");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, secret }),
  });
  if (!res.ok) throw new Error(`Python API responded with ${res.status}`);
  return (await res.json()) as T;
}
