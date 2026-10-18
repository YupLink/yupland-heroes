// Момент события из строки индекса Sendler — чистая функция для сервера и тестов.
//
// Наносекунды точнее; block_timestamp и last_updated_at Sendler отдаёт без
// зоны, но в UTC — дописываем Z, иначе время съедет на пояс сервера.
export function rowTimeMs(row: { timestamp_nanosec?: unknown; block_timestamp?: unknown }): number | null {
  const ns = Number(row.timestamp_nanosec);
  if (Number.isFinite(ns) && ns > 0) return Math.floor(ns / 1e6);
  const raw = String(row.block_timestamp ?? "");
  if (!raw) return null;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
  return Number.isFinite(t) ? t : null;
}
