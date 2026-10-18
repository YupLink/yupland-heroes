// Узлы NEAR RPC в порядке предпочтения: env NEAR_RPC_URL, NEAR_RPC_FALLBACKS, потом
// публичные. Вынесено из rpc.ts (лимит строк) — список нужен и rpc-absent.ts.
//
// 1rpc.io/near убран после того как словил дневной лимит и сломал
// верификацию депозитов. Если опять упрёмся в 429 на остальных —
// добавляй платный endpoint через env NEAR_RPC_URL, а не публичный.
//
// 28.08 из пула выброшены ещё двое — они умерли, но умерли тихо:
// near.lava.build отдаёт 410 с телом {"error":"This endpoint has been
// discontinued."}, omniatech — 521. Ни то, ни другое не 429 и не 5xx, поэтому
// перебор эндпоинтов считал ответ УДАЧНЫМ, запоминал мёртвый узел как
// «последний рабочий» и с тех пор возвращал его ошибку на каждый запрос.
// 31.08: пул расширен двумя живыми бесплатными узлами. Проверены не «на 200
// от /status», а настоящим call_function — 1rpc.io отсеян, он отвечает 200, но
// метод query у него не поддерживается.
const DEFAULT_ENDPOINTS = [
  "https://rpc.mainnet.fastnear.com",
  "https://free.rpc.fastnear.com",
  "https://near.drpc.org",
  "https://rpc.mainnet.near.org",
];

export function buildEndpointPool(): string[] {
  const out: string[] = [];
  const primary = process.env.NEAR_RPC_URL?.trim();
  if (primary) out.push(primary);
  const fallbacks = (process.env.NEAR_RPC_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const e of fallbacks) if (!out.includes(e)) out.push(e);
  for (const e of DEFAULT_ENDPOINTS) if (!out.includes(e)) out.push(e);
  return out;
}
