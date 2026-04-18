/**
 * Supabase REST API client using fetch
 * Works reliably on Railway without SDK initialization issues.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function sbHeaders(extra?: Record<string, string>) {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra,
  };
}

export async function sbGet(table: string, params = ''): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbGet ${table} → ${res.status}:`, err);
    throw new Error(`DB query failed on ${table}: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

export async function sbGetOne(table: string, params = ''): Promise<any> {
  const rows = await sbGet(table, params);
  return rows[0] ?? null;
}

export async function sbInsert(table: string, body: object | object[]): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbInsert ${table} → ${res.status}:`, err);
    throw new Error(`DB insert failed on ${table}: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

export async function sbInsertMany(table: string, body: object[]): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbInsertMany ${table} → ${res.status}:`, err);
    throw new Error(`DB insert failed on ${table}: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function sbUpsert(table: string, body: object | object[], onConflict: string): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbUpsert ${table} → ${res.status}:`, err);
    throw new Error(`DB upsert failed on ${table}: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function sbUpdate(table: string, params: string, body: object): Promise<any> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbUpdate ${table} → ${res.status}:`, err);
    throw new Error(`DB update failed on ${table}: ${err}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data.length > 0 ? data[0] : data) : data;
}

export async function sbDelete(table: string, params: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ sbDelete ${table} → ${res.status}:`, err);
    throw new Error(`DB delete failed on ${table}: ${err}`);
  }
}

export async function sbCount(table: string, params = ''): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  const res = await fetch(url, {
    headers: { ...sbHeaders(), 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
  });
  const contentRange = res.headers.get('content-range');
  if (!contentRange) return 0;
  const match = contentRange.match(/\/(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

export function extractFirst(data: any): any {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}