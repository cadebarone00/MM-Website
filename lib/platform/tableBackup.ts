/**
 * Read-only export of every table the Supabase REST API exposes, used as the
 * pre-migration data backup (docs/production-migration-checklist.md). It
 * only ever sends GET requests.
 */

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface TableInfo {
  name: string;
  /** Columns to sort by so pages never overlap or skip rows. */
  orderBy: string[];
}

export interface TableExport {
  name: string;
  rows: unknown[];
  expectedCount: number;
}

const PAGE_SIZE = 1000;

/** Tables (not views/functions) from the REST API's OpenAPI description, primary-key columns first for stable paging. */
export function tablesFromOpenApi(spec: unknown): TableInfo[] {
  const definitions = (spec as { definitions?: Record<string, { properties?: Record<string, { description?: string }> }> })?.definitions ?? {};
  return Object.entries(definitions)
    .map(([name, definition]) => {
      const columns = Object.entries(definition.properties ?? {});
      const primaryKey = columns.filter(([, column]) => column.description?.includes("<pk/>")).map(([column]) => column);
      return { name, orderBy: primaryKey.length > 0 ? primaryKey : columns.map(([column]) => column) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function headers(serviceKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

export async function listTables(fetcher: Fetcher, baseUrl: string, serviceKey: string): Promise<TableInfo[]> {
  const response = await fetcher(`${baseUrl}/rest/v1/`, { headers: headers(serviceKey, { Accept: "application/openapi+json" }) });
  if (!response.ok) throw new Error(`Could not list tables (HTTP ${response.status}): ${await response.text()}`);
  return tablesFromOpenApi(await response.json());
}

/** All rows of one table, page by page, checked against the server's own row count. */
export async function exportTable(fetcher: Fetcher, baseUrl: string, serviceKey: string, table: TableInfo): Promise<TableExport> {
  const rows: unknown[] = [];
  let expectedCount = 0;
  const order = table.orderBy.map((column) => `${encodeURIComponent(column)}.asc`).join(",");
  for (let start = 0; ; start += PAGE_SIZE) {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(table.name)}?select=*${order ? `&order=${order}` : ""}`;
    const response = await fetcher(url, {
      headers: headers(serviceKey, { "Range-Unit": "items", Range: `${start}-${start + PAGE_SIZE - 1}`, Prefer: "count=exact" }),
    });
    if (!response.ok && response.status !== 416) throw new Error(`Could not read ${table.name} (HTTP ${response.status}): ${await response.text()}`);
    const total = Number(response.headers.get("content-range")?.split("/")[1]);
    if (Number.isFinite(total)) expectedCount = total;
    if (response.status === 416) break; // asked past the end of an exactly-full last page
    const page = (await response.json()) as unknown[];
    rows.push(...page);
    if (page.length < PAGE_SIZE || rows.length >= expectedCount) break;
  }
  if (rows.length !== expectedCount) {
    throw new Error(`${table.name}: exported ${rows.length} rows but the database reports ${expectedCount}. Backup is incomplete.`);
  }
  return { name: table.name, rows, expectedCount };
}
