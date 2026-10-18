// Общий анти-карусельный контроль для ЛЮБОГО фарма за холд NFT
// (билеты, лайки-события, универсальный майнинг).
//
// Правила:
//   • Первое появление токена → фиксируем holder=wallet; токен ГОДЕН
//     (легитимного держателя НЕ обнуляем — накопление по обычному таймеру
//     кошелька). Клампа нет (cooldown_until = NULL).
//   • Сменился holder (переслали на другой кош, даже если потом вернули) →
//     cooldown_until = now+1д, farming_since = now+1д, НЕ годен 1 день.
//   • cooldown_until ещё не истёк → НЕ годен.
//   • Прошёл КД (был transfer, cu в прошлом, holder совпал) → годен, но
//     накопление стартует С 0 от farming_since (=конец КД) → clampSinceMs.
//
// Хранилище — yuplink.ticket_token_cd (ключ contract_id+token_id), по строке
// на КАЖДУЮ NFT. Ленивый upsert: пишем только новые/сменившие владельца.
// clampSinceMs содержит ТОЛЬКО прошедшие-КД токены (для «старт с 0» после
// пересылки); обычные токены туда не попадают и копят как раньше.
import { mcpExec } from "./db/mcpClient";

export const TRANSFER_CD_MS = 1 * 24 * 3_600_000; // 1 день

// Множество «своих» кошельков: смена holder'а МЕЖДУ СЁСТРАМИ (кошельки одного
// TG-аккаунта) — это НЕ карусель, КД не должен срабатывать. Иначе юзер держит
// NFT на одном своём коше, а клеймит с другого → CD блокирует свой же фарм.
function ownerSet(wallet: string, sisters?: string[]): Set<string> {
  const s = new Set<string>([wallet]);
  for (const w of sisters ?? []) if (w) s.add(w);
  return s;
}

// Readonly-сводка КД для UI (без записи — безопасно в GET-дисплеях).
// Возвращает: сколько NFT сейчас фармят (eligible), сколько на КД (переслали
// или ещё не истёк CD), и когда освободится ближайший (earliestFreeMs).
export async function getTokenCooldownSummary(
  contractId: string,
  tokens: string[],
  wallet: string,
  nowMs: number,
  sisters?: string[]
): Promise<{
  eligibleCount: number;
  onCooldownCount: number;
  earliestFreeMs: number | null;
}> {
  const owners = ownerSet(wallet, sisters);
  const uniq = Array.from(new Set(tokens.filter(Boolean)));
  if (uniq.length === 0)
    return { eligibleCount: 0, onCooldownCount: 0, earliestFreeMs: null };
  const qv = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
  const cEsc = String(contractId).replace(/'/g, "''");
  const rows = (await mcpExec(
    `SELECT token_id, holder_wallet, extract(epoch from cooldown_until)*1000 AS cu
     FROM yuplink.ticket_token_cd
     WHERE contract_id='${cEsc}' AND token_id IN (${uniq.map(qv).join(",")})`,
    { wrapJson: true }
  )) as Array<{ token_id: string; holder_wallet: string; cu: number | null }>;
  const state = new Map(rows.map((r) => [r.token_id, r]));
  let eligible = 0;
  let onCd = 0;
  let earliest: number | null = null;
  for (const t of uniq) {
    const s = state.get(t);
    if (!s) {
      eligible++; // первое появление → будет фармить
      continue;
    }
    if (!owners.has(s.holder_wallet)) {
      // получен переводом от ЧУЖОГО (не сестры) → уйдёт на КД
      onCd++;
      const free = nowMs + TRANSFER_CD_MS;
      if (earliest == null || free < earliest) earliest = free;
      continue;
    }
    if (s.cu != null && Number(s.cu) > nowMs) {
      onCd++;
      if (earliest == null || Number(s.cu) < earliest) earliest = Number(s.cu);
      continue;
    }
    eligible++;
  }
  return { eligibleCount: eligible, onCooldownCount: onCd, earliestFreeMs: earliest };
}

// Readonly-набор ГОДНЫХ токенов (без записи в БД) — для ДИСПЛЕЯ накопления,
// чтобы UI не рисовал полную полосу/CLAIM на токенах, которые на КД (сервер их
// всё равно не заклеймит → «нечего забирать»). Та же логика, что в
// getTokenCooldownSummary, но возвращает множество eligible + cu по токену.
export async function getEligibleTokenSet(
  contractId: string,
  tokens: string[],
  wallet: string,
  nowMs: number,
  sisters?: string[]
): Promise<{ eligible: Set<string>; cuByToken: Map<string, number> }> {
  const owners = ownerSet(wallet, sisters);
  const eligible = new Set<string>();
  const cuByToken = new Map<string, number>();
  const uniq = Array.from(new Set(tokens.filter(Boolean)));
  if (uniq.length === 0) return { eligible, cuByToken };
  const qv = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
  const cEsc = String(contractId).replace(/'/g, "''");
  const rows = (await mcpExec(
    `SELECT token_id, holder_wallet, extract(epoch from cooldown_until)*1000 AS cu
     FROM yuplink.ticket_token_cd
     WHERE contract_id='${cEsc}' AND token_id IN (${uniq.map(qv).join(",")})`,
    { wrapJson: true }
  )) as Array<{ token_id: string; holder_wallet: string; cu: number | null }>;
  const state = new Map(rows.map((r) => [r.token_id, r]));
  for (const t of uniq) {
    const s = state.get(t);
    if (!s) {
      eligible.add(t); // первое появление токена → годен
      continue;
    }
    if (!owners.has(s.holder_wallet)) {
      // получен переводом от ЧУЖОГО (не сестры) → уйдёт на КД
      cuByToken.set(t, nowMs + TRANSFER_CD_MS);
      continue;
    }
    if (s.cu != null && Number(s.cu) > nowMs) {
      cuByToken.set(t, Number(s.cu)); // ещё на КД
      continue;
    }
    eligible.add(t);
  }
  return { eligible, cuByToken };
}

// Readonly-двойник evaluateFarmTokenCooldown (БЕЗ записи в БД) — чтобы ДИСПЛЕЙ
// накопления совпадал с выплатой 1:1 (учитывает кламп «старт с 0» после КД).
// Возвращает eligible + clampSinceMs (для расчёта farmStart как в claim) +
// счётчики КД для бейджа.
export async function evaluateFarmTokenCooldownReadonly(
  contractId: string,
  tokens: string[],
  wallet: string,
  nowMs: number,
  sisters?: string[]
): Promise<{
  eligible: Set<string>;
  clampSinceMs: Map<string, number>;
  cuByToken: Map<string, number>;
  onCooldownCount: number;
  earliestFreeMs: number | null;
}> {
  const owners = ownerSet(wallet, sisters);
  const eligible = new Set<string>();
  const clampSinceMs = new Map<string, number>();
  // Будущий момент выхода из КД по КАЖДОМУ токену на КД (superset над
  // getEligibleTokenSet.cuByToken) — чтобы дисплей мог посчитать per-event
  // бейдж «сколько на КД + когда освободится» точечно, а не по контракту.
  const cuByToken = new Map<string, number>();
  let onCooldownCount = 0;
  let earliestFreeMs: number | null = null;
  const uniq = Array.from(new Set(tokens.filter(Boolean)));
  if (uniq.length === 0)
    return { eligible, clampSinceMs, cuByToken, onCooldownCount, earliestFreeMs };
  const qv = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
  const cEsc = String(contractId).replace(/'/g, "''");
  const rows = (await mcpExec(
    `SELECT token_id, holder_wallet,
            extract(epoch from farming_since)*1000 AS fs,
            extract(epoch from cooldown_until)*1000 AS cu
     FROM yuplink.ticket_token_cd
     WHERE contract_id='${cEsc}' AND token_id IN (${uniq.map(qv).join(",")})`,
    { wrapJson: true }
  )) as Array<{
    token_id: string;
    holder_wallet: string;
    fs: number | null;
    cu: number | null;
  }>;
  const state = new Map(rows.map((r) => [r.token_id, r]));
  for (const t of uniq) {
    const s = state.get(t);
    if (!s) {
      eligible.add(t); // первое появление → годен, без клампа
      continue;
    }
    if (!owners.has(s.holder_wallet)) {
      onCooldownCount++;
      const free = nowMs + TRANSFER_CD_MS;
      cuByToken.set(t, free);
      if (earliestFreeMs == null || free < earliestFreeMs) earliestFreeMs = free;
      continue;
    }
    if (s.cu != null && Number(s.cu) > nowMs) {
      onCooldownCount++;
      cuByToken.set(t, Number(s.cu));
      if (earliestFreeMs == null || Number(s.cu) < earliestFreeMs)
        earliestFreeMs = Number(s.cu);
      continue;
    }
    eligible.add(t);
    if (s.cu != null) clampSinceMs.set(t, Number(s.fs) || nowMs);
  }
  return { eligible, clampSinceMs, cuByToken, onCooldownCount, earliestFreeMs };
}

export async function evaluateFarmTokenCooldown(
  contractId: string,
  tokens: string[],
  wallet: string,
  nowMs: number,
  sisters?: string[]
): Promise<{ eligible: Set<string>; clampSinceMs: Map<string, number> }> {
  const owners = ownerSet(wallet, sisters);
  const eligible = new Set<string>();
  const clampSinceMs = new Map<string, number>();
  const uniq = Array.from(new Set(tokens.filter(Boolean)));
  if (uniq.length === 0) return { eligible, clampSinceMs };
  const qv = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
  const cEsc = String(contractId).replace(/'/g, "''");
  const rows = (await mcpExec(
    `SELECT token_id, holder_wallet,
            extract(epoch from farming_since)*1000 AS fs,
            extract(epoch from cooldown_until)*1000 AS cu
     FROM yuplink.ticket_token_cd
     WHERE contract_id='${cEsc}' AND token_id IN (${uniq.map(qv).join(",")})`,
    { wrapJson: true }
  )) as Array<{
    token_id: string;
    holder_wallet: string;
    fs: number | null;
    cu: number | null;
  }>;
  const state = new Map(rows.map((r) => [r.token_id, r]));

  const upserts: string[] = [];
  for (const t of uniq) {
    const s = state.get(t);
    if (!s) {
      // Первое появление: фиксируем держателя, токен ГОДЕН, без клампа.
      upserts.push(
        `(${qv(cEsc)}, ${qv(t)}, ${qv(wallet)}, ${qv(new Date(nowMs).toISOString())}, NULL, now())`
      );
      eligible.add(t);
      continue;
    }
    if (!owners.has(s.holder_wallet)) {
      // Смена владельца ЧУЖОМУ (не сестре) → 1-дневный КД, фарм с 0.
      const cdEnd = new Date(nowMs + TRANSFER_CD_MS).toISOString();
      upserts.push(
        `(${qv(cEsc)}, ${qv(t)}, ${qv(wallet)}, ${qv(cdEnd)}, ${qv(cdEnd)}, now())`
      );
      continue;
    }
    if (s.cu != null && Number(s.cu) > nowMs) continue; // ещё на КД
    eligible.add(t);
    // Кламп «старт с 0» — только если токен КОГДА-ТО был на КД (переслан).
    if (s.cu != null) clampSinceMs.set(t, Number(s.fs) || nowMs);
  }
  if (upserts.length > 0) {
    await mcpExec(
      `INSERT INTO yuplink.ticket_token_cd(contract_id, token_id, holder_wallet, farming_since, cooldown_until, updated_at)
       VALUES ${upserts.join(",")}
       ON CONFLICT (contract_id, token_id) DO UPDATE SET
         holder_wallet=EXCLUDED.holder_wallet,
         farming_since=EXCLUDED.farming_since,
         cooldown_until=EXCLUDED.cooldown_until,
         updated_at=now()`
    );
  }
  return { eligible, clampSinceMs };
}
