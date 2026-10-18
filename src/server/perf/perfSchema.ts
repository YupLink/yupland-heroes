// Таблицы замеров: снимки воркеров и пробы с клиентов.
//
// Создаются лениво, раз на процесс, IF NOT EXISTS — миграцию под две служебные
// таблицы заводить незачем, а сервер обязан работать и без них (ошибка тут
// глотается тем, кто пишет). Данные короткоживущие, чистка в snapshots.ts.
//
// По одному statement на вызов: прямой драйвер pg на пачке statements отдаёт
// массив результатов, mcpExec его не распознаёт и повторяет весь SQL через
// мост — DDL шёл бы дважды, а при лежащем мосте ещё и падал бы после успеха.
import { mcpExec } from "../db/mcpClient";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS yuplink.perf_snapshot (
     worker text NOT NULL,
     at timestamptz NOT NULL DEFAULT now(),
     data jsonb NOT NULL,
     PRIMARY KEY (worker, at)
   );`,
  `CREATE INDEX IF NOT EXISTS perf_snapshot_at_idx ON yuplink.perf_snapshot (at);`,
  `CREATE TABLE IF NOT EXISTS yuplink.perf_client (
     id bigserial PRIMARY KEY,
     at timestamptz NOT NULL DEFAULT now(),
     wallet text NOT NULL,
     mobile boolean NOT NULL DEFAULT false,
     ua text,
     sample jsonb NOT NULL
   );`,
  `CREATE INDEX IF NOT EXISTS perf_client_at_idx ON yuplink.perf_client (at);`,
];

let ensured: Promise<void> | null = null;

export function ensurePerfSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const sql of STATEMENTS) await mcpExec(sql, { wrapJson: false });
    })().catch((e) => {
      // Следующий вызов попробует снова: база могла быть недоступна.
      ensured = null;
      throw e;
    });
  }
  return ensured;
}
