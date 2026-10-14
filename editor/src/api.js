let tenant = "tenant-a";
export const setTenant = (t) => (tenant = t);
async function call(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenant },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}
export const api = {
  list: () => call("/workflows"),
  get: (n) => call(`/workflows/${n}`),
  save: (n, definition) => call(`/workflows/${n}`, { method: "PUT", body: JSON.stringify({ definition }) }),
  run: (n, context, speed) => call(`/workflows/${n}/run`, { method: "POST", body: JSON.stringify({ context, speed }) }),
  summary: () => call("/analytics/summary"),
  replay: (id) => call(`/runs/${id}/events`),
};
