import { parseYearChange } from "./settings";

type Change = NonNullable<ReturnType<typeof parseYearChange>>;
export async function saveWebsiteSetting(request: Request, dependencies: {
  authorize: () => Promise<{ userId: string } | null>;
  write: (change: Change, userId: string) => Promise<boolean>;
}): Promise<Response> {
  const host = await dependencies.authorize();
  if (!host) return Response.json({ error: "Not authorized." }, { status: 401 });
  const change = parseYearChange(await request.json().catch(() => null));
  if (!change) return Response.json({ error: "Choose a valid section and year, or Automatic." }, { status: 400 });
  const saved = await dependencies.write(change, host.userId);
  if (!saved) return Response.json({ error: "Could not save. Check that website_section_settings.sql is installed, then retry." }, { status: 500 });
  return Response.json({ ok: true, ...change }, { headers: { "Cache-Control": "no-store" } });
}
