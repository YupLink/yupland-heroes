// PostgREST-based клиент к Supabase для всех YupLink-таблиц (schema=yuplink).
// service_role обходит RLS — пишет/читает напрямую как админ.
//
// API стилизован под drizzle для постепенной миграции из libSQL:
//   const u = await pg.users.findFirst({ wallet: "alice.tg" });
//   const all = await pg.campaigns.findMany({ status: "active" });
//   await pg.users.upsert({ wallet, telegram_id }, { onConflict: "wallet" });
//
// nfts/collection_titles/scan_state ОСТАЮТСЯ на Turso (db из ../db).
// Здесь только то что мигрировано в yuplink schema.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { postgrestShimFetch, getFakeSupabaseUrl } from "./postgrestShim";

// Схема задаётся через db:{schema} — точный generic-тип клиента здесь неважен,
// все цепочки ниже и так работают через касты (as never / as Row).
type SbClient = SupabaseClient<any, any, any, any, any>;

// USE_MCP_DB=true — прод-код ходит в БД через portal-prod postgres-mcp
// (SSE+POST на mcp.yupland.io). PostgrEST-совместимый shim parsит URL,
// строит SQL и шлёт через execute_sql. Без флага — обычный Supabase REST.
//
// ВАЖНО: клиент создаётся ЛЕНИВО (при первом обращении), а не на module-load.
// Причина: этот модуль может попасть в клиентский bundle через цепочку
// импортов (роут '/' → кош-компоненты → server-fn файлы). Раньше здесь был
// top-level `throw` и `createClient` — side-effect, который bundler не может
// вырезать, из-за чего клиентский чанк падал при загрузке (env на клиенте
// нет) и ронял всю гидрацию. Теперь module-load безвреден: на клиенте sb
// никогда не вызывается (все обращения к БД идут через RPC на сервер), а на
// сервере клиент инициализируется при первом .from()/.rpc().
function buildClient(schema: "yuplink" | "public"): SbClient {
  const USE_MCP = (process.env.USE_MCP_DB ?? "").toLowerCase() === "true";
  const url = USE_MCP ? getFakeSupabaseUrl() : process.env.SUPABASE_URL;
  const key = USE_MCP ? "mcp-shim" : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не сконфигурированы");
  }
  const opts = USE_MCP
    ? {
        db: { schema },
        auth: { persistSession: false },
        global: { fetch: postgrestShimFetch as typeof fetch },
      }
    : { db: { schema }, auth: { persistSession: false } };
  return createClient(url, key, opts);
}

let _sb: SbClient | null = null;
let _sbPublic: SbClient | null = null;

/** Ленивый Proxy: реальный клиент строится при первом доступе к свойству. */
function lazyClient(get: () => SbClient): SbClient {
  return new Proxy({} as SupabaseClient, {
    get(_t, prop) {
      const c = get();
      const v = (c as unknown as Record<string | symbol, unknown>)[prop];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
    },
  });
}

export const sb: SupabaseClient = lazyClient(() => (_sb ??= buildClient("yuplink")));

// Read-only клиент к public schema (это shared Yupland-портала: profiles,
// achievements, levels, user_achievements, и т.д.). Используем только для
// чтения — портал владелец данных.
export const sbPublic: SupabaseClient = lazyClient(() => (_sbPublic ??= buildClient("public")));

// ──────── Типы строк (соответствуют yuplink.* таблицам) ────────
// Имена колонок — snake_case как в Postgres. Конвертацию в camelCase
// делает app-layer там где это нужно (исторически legacy с libSQL).
export type Order = {
  column: string;
  ascending?: boolean;
};

type TableQuery<Row> = {
  /** Возвращает одну строку или null. Бросает если найдено >1. */
  findOne(filter: Partial<Row>, opts?: { orderBy?: Order }): Promise<Row | null>;
  /** Возвращает первую строку (или null) — без проверки уникальности. */
  findFirst(filter?: Partial<Row>, opts?: { orderBy?: Order; limit?: number }): Promise<Row | null>;
  /** Возвращает все строки матчащие фильтр (по полному equality match). */
  findMany(
    filter?: Partial<Row>,
    opts?: { orderBy?: Order; limit?: number; offset?: number },
  ): Promise<Row[]>;
  /** Сырой select для сложных where (IN, gt, lt, NOT-null). */
  raw(): ReturnType<SupabaseClient["from"]>;
  /** Insert одной/многих строк. Бросает на ошибке. */
  insert(values: Partial<Row> | Partial<Row>[]): Promise<void>;
  /** Upsert по PK (или onConflict). */
  upsert(values: Partial<Row> | Partial<Row>[], opts?: { onConflict?: string }): Promise<void>;
  /** Update строк по фильтру. */
  update(filter: Partial<Row>, patch: Partial<Row>): Promise<void>;
  /** Delete по фильтру. */
  delete(filter: Partial<Row>): Promise<void>;
  /** Count матчей. */
  count(filter?: Partial<Row>): Promise<number>;
};

function applyEqFilters(q: any, filter?: Record<string, unknown>) {
  if (!filter) return q;
  let out = q;
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined) continue;
    if (v === null) out = out.is(k, null);
    else out = out.eq(k, v as never);
  }
  return out;
}

function makeTable<Row extends Record<string, unknown>>(table: string): TableQuery<Row> {
  return {
    async findOne(filter, opts) {
      let q = applyEqFilters(sb.from(table).select("*"), filter);
      if (opts?.orderBy)
        q = q.order(opts.orderBy.column, {
          ascending: opts.orderBy.ascending ?? true,
        });
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`pg.${table}.findOne: ${error.message}`);
      return (data as Row | null) ?? null;
    },
    async findFirst(filter, opts) {
      let q = applyEqFilters(sb.from(table).select("*"), filter);
      if (opts?.orderBy)
        q = q.order(opts.orderBy.column, {
          ascending: opts.orderBy.ascending ?? true,
        });
      q = q.limit(opts?.limit ?? 1);
      const { data, error } = await q;
      if (error) throw new Error(`pg.${table}.findFirst: ${error.message}`);
      return ((data?.[0] as Row | undefined) ?? null) as Row | null;
    },
    async findMany(filter, opts) {
      // Если задан limit — обычный запрос. Без limit — auto-pagination
      // чтобы не упереться в PostgREST max-rows (default 1000, у нас поднят
      // до 100k, но на всякий случай страхуемся).
      if (opts?.limit != null) {
        let q = applyEqFilters(sb.from(table).select("*"), filter);
        if (opts.orderBy)
          q = q.order(opts.orderBy.column, {
            ascending: opts.orderBy.ascending ?? true,
          });
        q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1);
        const { data, error } = await q;
        if (error) throw new Error(`pg.${table}.findMany: ${error.message}`);
        return (data as Row[]) ?? [];
      }
      // Auto-pagination по 1000.
      const PAGE = 1000;
      const all: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = applyEqFilters(sb.from(table).select("*"), filter);
        if (opts?.orderBy)
          q = q.order(opts.orderBy.column, {
            ascending: opts.orderBy.ascending ?? true,
          });
        q = q.range(from, from + PAGE - 1);
        const { data, error } = await q;
        if (error) throw new Error(`pg.${table}.findMany: ${error.message}`);
        const chunk = (data as Row[]) ?? [];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
      }
      return all;
    },
    raw() {
      return sb.from(table);
    },
    async insert(values) {
      const { error } = await sb.from(table).insert(values as never);
      if (error) throw new Error(`pg.${table}.insert: ${error.message}`);
    },
    async upsert(values, opts) {
      const { error } = await sb
        .from(table)
        .upsert(values as never, { onConflict: opts?.onConflict });
      if (error) throw new Error(`pg.${table}.upsert: ${error.message}`);
    },
    async update(filter, patch) {
      const q = applyEqFilters(sb.from(table).update(patch as never), filter);
      const { error } = await q;
      if (error) throw new Error(`pg.${table}.update: ${error.message}`);
    },
    async delete(filter) {
      const q = applyEqFilters(sb.from(table).delete(), filter);
      const { error } = await q;
      if (error) throw new Error(`pg.${table}.delete: ${error.message}`);
    },
    async count(filter) {
      let q = sb.from(table).select("*", { count: "exact", head: true });
      q = applyEqFilters(q, filter);
      const { count, error } = await q;
      if (error) throw new Error(`pg.${table}.count: ${error.message}`);
      return count ?? 0;
    },
  };
}

// ──────── Row-типы (минимум полей, что мы используем) ────────
// Полные определения здесь не нужны — TS сам сужает по доступу. Для
// сложных кейсов всегда есть .raw() для прямого supabase-js.

export type PgAccount = {
  id: string;
  telegram_id: number | null;
  /** Последний выбранный юзером активный кош (запоминаем между входами). */
  active_wallet: string | null;
  created_at: string;
};

export type PgUser = {
  wallet: string;
  referred_by: string | null;
  telegram_id: number | null;
  telegram_username: string | null;
  telegram_linked_at: string | null;
  detached: boolean;
  /** Юзер-ид (учётная запись): кош↔аккаунт (миграция на account_id). */
  account_id: string | null;
  /** Кош отключён юзером: скрыт из списка/выбора, но account_id остаётся →
   *  его активы продолжают жить на учётке (не сиротеют). Re-connect → false. */
  disconnected: boolean;
  notifications_enabled: boolean;
  created_at: string;
  /** Сколько билетов уже выдано за реферальные тиеры (0..13).
   *  Растёт только вверх. Защита от дублирования при пересчёте. */
  referral_tier_tickets_granted: number;
  /** v2-прихожа: аккаунт зашёл через прихожу и ещё не выпущен в игру.
   *  default false → старые юзеры считаются выпущенными (не запираются). */
  hallway_onboarding: boolean;
  // ── Атрибуты кошелька (identity: кош = атрибут аккаунта, не вход) ──
  /** Тип коша: telegram (нет ключа) | embedded (ключ на устройстве) | hot | external. */
  wallet_kind: string | null;
  /** Где хранится ключ: device | hot_app | external_app | null (telegram-личность). */
  wallet_storage: string | null;
  /** Владение кошем доказано подписью (NEP-413). Для telegram-личности неприменимо. */
  ownership_verified: boolean;
  ownership_verified_at: string | null;
  /** Чем доказано: nep413 | (в будущем др.). */
  ownership_method: string | null;
};

export type PgCampaign = {
  id: string;
  name: string;
  contract_id: string;
  scope: string;
  scope_token_ids: string | null;
  reward_min: number;
  reward_max: number;
  reward_token: string;
  max_total_pool: number | null;
  max_users: number | null;
  free_claim: boolean;
  status: "draft" | "active" | "paused" | "ended";
  payout_mode: "auto" | "manual";
  referral_bonus: boolean;
  starts_at: string | null;
  ends_at: string | null;
  mode: "simple" | "combo";
  requirements: string | null;
  reward_tiers: string | null;
  ticket_cost: number;
  created_at: string;
  reward_kind: "ft" | "nft";
  nft_contract: string | null;
  nft_pool: string | null; // jsonb: [{token_id, weight}] или [{title, weight, count}]
  // Chip-target: дроп требует фишку из указанной коллекции уровня >= min.
  // Когда задано — игнорируется requirements/contract_id, ownership-проверка
  // идёт по NFT-фишкам (yuplandshop) с title'ами из buildChipNftTitle для
  // каждого template коллекции × eligible level.
  chip_collection_id: string | null;
  chip_min_level: number | null; // 3, 3.5, 4, 4.5 или 5
  // Авто-перезапуск: если true — по истечении 30 дней дроп НЕ завершается, а
  // клонируется в новую кампанию (новый id, окно 30д заново), старая → ended.
  // Новый campaign_id освобождает UNIQUE(campaign,contract,token) → юзеры клеймят
  // награду по своим NFT заново раз в цикл. По умолчанию false. См. крон daily-likes.
  recurring: boolean;
};

export type PgRedemption = {
  id: string;
  contract_id: string;
  token_id: string;
  campaign_id: string | null;
  account_id: string;
  wallet: string;
  amount: number;
  tx_hash: string | null;
  status: "pending" | "processing" | "paid" | "cancelled";
  redeemed_at: string;
  reward_token: string | null;
  ft_contract: string | null;
  decimals: number | null;
  ticket_cost: number;
  fee_tx_hash: string | null;
  // TX-verification: хеш отправленной но не подтверждённой TX,
  // записывается ДО broadcast'а. Поллер по этому хешу резолвит processing.
  processing_tx_hash: string | null;
  processing_started_at: string | null;
  // Оригинальный amount до lock'а split-row (для корректного rollback и
  // создания leftover-row resolver'ом).
  processing_orig_amount: number | null;
};

export type PgNftRedemption = {
  id: string;
  campaign_id: string | null;
  user_wallet: string;
  contract_id: string;
  token_id: string;
  status: "pending" | "withdrawn";
  claimed_at: string;
  withdrawn_at: string | null;
  tx_hash: string | null;
  fee_tx_hash: string | null;
  processing_tx_hash: string | null;
  processing_started_at: string | null;
  /** Snapshot имени NFT в момент клейма. При выводе ищем любой свободный
   *  token с этим именем (token_id может стать невалидным). */
  nft_title: string | null;
};

export type PgReferral = {
  id: string;
  inviter_wallet: string;
  friend_wallet: string;
  joined_at: string;
};

export type PgSetting = { key: string; value: string };

/** Группа тестеров: кому владелец открывает механики раньше остальных. */
export type PgTester = {
  wallet: string;
  note: string | null;
  added_by: string | null;
  added_at: string;
};

export type PgRewardToken = {
  symbol: string;
  ft_contract: string;
  decimals: number;
  sort_order: number;
  created_at: string;
  min_withdraw: number;
  // is_native — нативный NEAR (Transfer, не ft_transfer). whole_only — вывод
  // только целыми (очковые токены: floor+накопление); false — точные дроби
  // (реальные деньги USDT/NEAR).
  is_native: boolean;
  whole_only: boolean;
};

export type PgTask = {
  id: string;
  kind: "tg_channel" | "custom";
  title: string;
  description: string | null;
  image: string | null;
  target: string | null;
  active: boolean;
  created_at: string;
};

export type PgTaskCompletion = {
  id: string;
  task_id: string;
  account_id: string;
  wallet: string;
  completed_at: string;
};

export type PgTicketEvent = {
  id: string;
  contract_id: string;
  requirements: string;
  reward_tickets: number;
  hold_duration_sec: number;
  active: boolean;
  created_at: string;
};

export type PgLikeEvent = {
  id: string;
  contract_id: string;
  requirements: string; // JSON [{title, count}]
  reward_likes: number;
  hold_duration_sec: number;
  active: boolean;
  created_at: string;
};

export type PgLikeClaim = {
  id: string;
  event_id: string;
  account_id: string;
  wallet: string;
  token_ids: string; // JSON snapshot of ["123","456"]
  likes_awarded: number;
  claimed_at: string;
};

export type PgTicketHolding = {
  id: string;
  event_id: string;
  wallet: string;
  eligible_at: string;
  snapshot_tokens: string;
  started_at: string;
};

export type PgTicketClaim = {
  id: string;
  event_id: string;
  account_id: string;
  wallet: string;
  token_ids: string;
  tickets_awarded: number;
  claimed_at: string;
};

// Леджер оплат Telegram Stars (идемпотентность по telegram_payment_charge_id).
export type PgStarPayment = {
  id: string;
  telegram_payment_charge_id: string;
  telegram_id: number | null;
  wallet: string | null;
  kind: string;
  offer_id: string | null;
  payload: any;
  amount_stars: number;
  granted: boolean;
  created_at: string;
};

export type PgTgChallenge = {
  nonce: string;
  wallet: string;
  created_at: string;
  expires_at: string;
  consumed: boolean;
  error_message: string | null;
};

export type PgTicketShopOffer = {
  id: string;
  tickets: number;
  price_energy: number;
  payment_token: string | null;
  price_token: number | null;
  price_stars: number | null; // цена в Telegram Stars (null = нельзя за звёзды)
  /** Тариф в $ (07.10.2026): USDT / DARAI / Stars считаются от него по курсу. */
  price_usd?: number | string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type PgYuplandGrant = {
  wallet: string;
  access_token: string;
  yupland_user_id: string;
  scope: string;
  expires_at: string | null;
  created_at: string;
};

export type PgYuplandAuthState = {
  state: string;
  wallet: string;
  created_at: string;
  expires_at: string;
};

/** Хранимый баланс билетов (источник истины вместе с ticket_ledger). */
export type PgTicketBalance = {
  account: string;
  balance: number;
  updated_at: string;
};

/** Журнал движений билетов: каждая операция отдельной строкой. */
export type PgTicketLedger = {
  id: string;
  account: string;
  wallet: string | null;
  delta: number;
  kind: string;
  ref: string | null;
  balance_after: number;
  created_at: string;
};

/** Движения ресурсного счёта. Только вставки, писатель один — acc_move. */
export type PgAccLedger = {
  id: string;
  account_id: string;
  wallet: string | null;
  token: string;
  delta: number;
  kind: string;
  ref: string;
  balance_after: number;
  created_at: string;
};

/** Квитанции пополнения счёта. Ключ на tx_hash — защита от двойного зачёта. */
export type PgAccDepositTx = {
  tx_hash: string;
  account_id: string;
  wallet: string | null;
  token: string;
  amount: number;
  created_at: string;
};

export type PgTicketPurchase = {
  id: string;
  account_id: string;
  wallet: string;
  offer_id: string;
  tickets_added: number;
  energy_spent: number;
  yupland_tx_id: string | null;
  payment_token: string | null;
  payment_amount: number | null;
  near_tx_hash: string | null;
  idempotency_key: string;
  created_at: string;
};

export type PgAuditLog = {
  id: string;
  actor: string | null;
  action: string;
  payload: string | null;
  created_at: string;
};

export type PgHiddenCampaign = {
  id: string;
  scope_key: string;
  campaign_id: string;
  hidden_at: string;
};

export type PgNotifiedListing = {
  sale_id: string;
  token_id: string;
  title: string;
  price_raw: string;
  price_token: string;
  notified_at: string;
};

export type PgSendlerReputation = {
  wallet: string;
  rank: number | null;
  negative_rank: number | null;
  total_reputation: number;
  house: number | null;
  bonus_reputation: number | null;
  updated_at: string;
};

export type PgNft = {
  id: string;
  contract_id: string;
  token_id: string;
  collection: string;
  name: string;
  image: string;
  owner_wallet: string | null;
};

export type PgCollectionTitle = {
  id: string;
  contract_id: string;
  title: string;
  image: string | null;
  count: number;
  // Сколько NFT этого title сожжено (на BURN_WALLET = darai_duplo.near).
  // circulating = count - burnt_count.
  burnt_count: number;
  scanned_at: string;
};

export type PgScanState = {
  contract_id: string;
  last_skip: number;
  total_seen: number;
  last_scanned_at: string | null;
};

// Non-custodial embedded-кошелёк: бэк хранит ТОЛЬКО публичные поля.
// Поля encrypted_* удалены миграцией 2026-05-17; мёртвые backup_*-колонки
// (cloud-backup) удалены 2026-06-24 (migrate-drop-dead-backup-cols.ts).
export type PgUserWallet = {
  account_id: string;
  linked_user: string | null;
  linked_tg_id: number | null;
  public_key: string;
  is_active: boolean;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  // Зашифрованный паролем бэкап сид-фразы (шифр-блоб {encSeed,salt,nonce,kdf}).
  // Сервер хранит как непрозрачный jsonb — расшифровать не может (нет пароля).
  backup_blob: any | null;
  backup_at: string | null;
};

export type PgKmsDecryptLog = {
  id: string;
  decrypted_at: string;
  key_label: string;
  caller: string | null;
  ip: string | null;
  user_agent: string | null;
  duration_ms: number | null;
  ok: boolean;
  error: string | null;
};

export type PgAdminPayoutPending = {
  id: string;
  recipient: string;
  ft_contract: string;
  amount_human: number;
  decimals: number;
  reward_symbol: string;
  reason: string | null;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "executed" | "failed" | "rejected" | "expired";
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  tx_hash: string | null;
  error: string | null;
  tg_message_ids: string | null;
};

export type PgWalletAudit = {
  id: string;
  account_id: string;
  action:
    | "register"
    | "create"
    | "import"
    | "sign_tx"
    | "export_seed"
    | "export_private_key"
    | "rotate_key"
    | "deactivate";
  actor: string | null;
  metadata: string | null;
  created_at: string;
};

// ──────── Главный экспорт: pg.<table>.findFirst / findMany / insert / ... ────────
export const pg = {
  users: makeTable<PgUser>("users"),
  accounts: makeTable<PgAccount>("accounts"),
  campaigns: makeTable<PgCampaign>("campaigns"),
  redemptions: makeTable<PgRedemption>("redemptions"),
  referrals: makeTable<PgReferral>("referrals"),
  settings: makeTable<PgSetting>("settings"),
  testers: makeTable<PgTester>("testers"),
  rewardTokens: makeTable<PgRewardToken>("reward_tokens"),
  tasks: makeTable<PgTask>("tasks"),
  taskCompletions: makeTable<PgTaskCompletion>("task_completions"),
  ticketEvents: makeTable<PgTicketEvent>("ticket_events"),
  likeEvents: makeTable<PgLikeEvent>("like_events"),
  likeClaims: makeTable<PgLikeClaim>("like_claims"),
  ticketHoldings: makeTable<PgTicketHolding>("ticket_holdings"),
  ticketClaims: makeTable<PgTicketClaim>("ticket_claims"),
  starPayments: makeTable<PgStarPayment>("star_payments"),
  tgChallenges: makeTable<PgTgChallenge>("tg_challenges"),
  ticketShopOffers: makeTable<PgTicketShopOffer>("ticket_shop_offers"),
  yuplandGrants: makeTable<PgYuplandGrant>("yupland_grants"),
  yuplandAuthStates: makeTable<PgYuplandAuthState>("yupland_auth_states"),
  ticketPurchases: makeTable<PgTicketPurchase>("ticket_purchases"),
  ticketBalance: makeTable<PgTicketBalance>("ticket_balance"),
  ticketLedger: makeTable<PgTicketLedger>("ticket_ledger"),
  accLedger: makeTable<PgAccLedger>("acc_ledger"),
  accDepositTx: makeTable<PgAccDepositTx>("acc_deposit_tx"),
  auditLog: makeTable<PgAuditLog>("audit_log"),
  hiddenCampaigns: makeTable<PgHiddenCampaign>("hidden_campaigns"),
  notifiedMarketplaceListings: makeTable<PgNotifiedListing>("notified_marketplace_listings"),
  sendlerReputation: makeTable<PgSendlerReputation>("sendler_reputation"),
  nfts: makeTable<PgNft>("nfts"),
  collectionTitles: makeTable<PgCollectionTitle>("collection_titles"),
  scanState: makeTable<PgScanState>("scan_state"),
  userWallets: makeTable<PgUserWallet>("user_wallets"),
  walletAudit: makeTable<PgWalletAudit>("wallet_audit"),
  adminPayoutsPending: makeTable<PgAdminPayoutPending>("admin_payouts_pending"),
  kmsDecryptLog: makeTable<PgKmsDecryptLog>("kms_decrypt_log"),
  nftRedemptions: makeTable<PgNftRedemption>("nft_redemptions"),
  nftLikeCandidates: makeTable<PgNftLikeCandidate>("nft_like_candidates"),
  nftLikes: makeTable<PgNftLike>("nft_likes"),
  userLikeBalance: makeTable<PgUserLikeBalance>("user_like_balance"),
  likePurchases: makeTable<PgLikePurchase>("like_purchases"),
  likeShopOffers: makeTable<PgLikeShopOffer>("like_shop_offers"),
  likePromocodes: makeTable<PgLikePromocode>("like_promocodes"),
  likePromocodeActivations: makeTable<PgLikePromocodeActivation>("like_promocode_activations"),
  nftPacks: makeTable<PgNftPack>("nft_packs"),
  nftPackItems: makeTable<PgNftPackItem>("nft_pack_items"),
  userPackInventory: makeTable<PgUserPackInventory>("user_pack_inventory"),
  // YUPLINK игровая часть (фишки/коллекции/паки-фишек)
  chipCollections: makeTable<PgChipCollection>("chip_collections"),
  chipTemplates: makeTable<PgChipTemplate>("chip_templates"),
  chipPacks: makeTable<PgChipPack>("chip_packs"),
  chipPackGrants: makeTable<PgChipPackGrant>("chip_pack_grants"),
  mysticItemTemplates: makeTable<PgMysticItemTemplate>("mystic_item_template"),
  userGameItems: makeTable<PgUserGameItem>("user_game_item"),
  chipCollectionHero: makeTable<PgChipCollectionHero>("chip_collection_hero"),
  // Экземпляры героев у игроков: уровень, редкость, экипировка (см. api/heroes.ts).
  heroInstances: makeTable<PgHeroInstance>("hero_instance"),
  energyPacks: makeTable<PgEnergyPack>("energy_packs"),
  energyPackPurchases: makeTable<PgEnergyPackPurchase>("energy_pack_purchases"),
  userChipInventory: makeTable<PgUserChipInventory>("user_chip_inventory"),
  chipEconomySpend: makeTable<PgChipEconomySpend>("chip_economy_spend"),
  chipCraftTicketSpend: makeTable<PgChipCraftTicketSpend>("chip_craft_ticket_spend"),
  userEnergy: makeTable<PgUserEnergy>("user_energy"),
  chipBoss: makeTable<PgChipBoss>("chip_boss"),
  chipBossRun: makeTable<PgChipBossRun>("chip_boss_run"),
  chipBossReward: makeTable<PgChipBossReward>("chip_boss_reward"),
  chipBossSession: makeTable<PgChipBossSession>("chip_boss_session"),
  raidLocation: makeTable<PgRaidLocation>("raid_location"),
  raidNode: makeTable<PgRaidNode>("raid_node"),
  raidForkLink: makeTable<PgRaidForkLink>("raid_fork_link"),
  raidPosition: makeTable<PgRaidPosition>("raid_position"),
  raidChestOpen: makeTable<PgRaidChestOpen>("raid_chest_open"),
  raidBossTemplate: makeTable<PgRaidBossTemplate>("raid_boss_template"),
  raidReward: makeTable<PgRaidReward>("raid_reward"),
  raidMaps: makeTable<PgRaidMap>("raid_maps"),
  raidMapCells: makeTable<PgRaidMapCell>("raid_map_cells"),
  daraiDeposits: makeTable<PgDaraiDeposit>("darai_deposits"),
  walletDappConnections: makeTable<PgWalletDappConnection>("wallet_dapp_connections"),
  // Hallway («Прихожая») — онбординг новых пользователей.
  hallwayYupiks: makeTable<PgHallwayYupik>("hallway_yupiks"),
  hallwayLevels: makeTable<PgHallwayLevel>("hallway_levels"),
  hallwayChests: makeTable<PgHallwayChest>("hallway_chests"),
  hallwayTrainingChips: makeTable<PgHallwayTrainingChip>("hallway_training_chips"),
  hallwayTasks: makeTable<PgHallwayTask>("hallway_tasks"),
  hallwayTaskCompletions: makeTable<PgHallwayTaskCompletion>("hallway_task_completions"),
  hallwayChestOpenings: makeTable<PgHallwayChestOpening>("hallway_chest_openings"),
  hallwayBlockchainRewards: makeTable<PgHallwayBlockchainReward>("hallway_blockchain_rewards"),
  hallwayChestInventory: makeTable<PgHallwayChestInventory>("hallway_chest_inventory"),
  chipPvpBattles: makeTable<PgChipPvpBattle>("chip_pvp_battles"),
  chipMarketListings: makeTable<PgChipMarketListing>("chip_market_listings"),
  chipMarketLedger: makeTable<PgChipMarketLedger>("chip_market_ledger"),
  chipMarketAudit: makeTable<PgChipMarketAudit>("chip_market_audit"),
  adminBatchPayoutsPending: makeTable<PgAdminBatchPayoutPending>("admin_batch_payouts_pending"),
};

// Стейкинг (майнинг билетов слотами) хранится в yuplink.settings —
// одна JSON-строка на кошелёк, ключ `mining:<wallet>`. Без отдельных
// таблиц (DDL недоступен на shared прод-БД портала).

// ──────── DARAI top-up (юзер сам шлёт ft_transfer на наш сервисный кош) ────────
export type PgDaraiDeposit = {
  id: string;
  wallet: string;
  tx_hash: string;
  amount: number; // human-units (без деноминации)
  ft_contract: string;
  receiver_id: string;
  created_at: string;
};

// ──────── YupLink Wallet · dApp-коннекторы ────────
export type PgWalletDappConnection = {
  id: string;
  wallet: string;
  dapp_origin: string;
  dapp_name: string | null;
  dapp_icon_url: string | null;
  public_key: string;
  contract_id: string | null;
  methods: string[] | null;
  allowance_yocto: string | null;
  granted_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  granted_tx_hash: string | null;
  revoked_tx_hash: string | null;
};

// ──────── YUPLINK · игровая часть ────────
export type PgChipCollection = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  initial_supply: number;
  burned_count: number;
  minted_count: number;
  in_game_count: number;
  status: "active" | "sealed" | "archived";
  expandable: boolean;
  is_premium: boolean; // премиум-коллекция → +бонус «Единство: Тираж»
  sort_order: number;
  created_at: string;
  created_by_wallet: string | null;
  updated_at: string;
};

export type PgChipTemplate = {
  id: string;
  collection_id: string;
  template_no: number;
  name: string;
  description: string | null;
  image_url: string;
  damage_table: any | null;
  rarity_hint: string | null;
  sort_order: number;
  created_at: string;
};

// Энерго-пак магазина: покупается за билеты/DARAI, начисляет энергию.
export type PgEnergyPack = {
  id: string;
  title: string;
  amount: number; // сколько энергии начисляет
  price_tickets: number | null; // цена в билетах (null = нельзя за билеты)
  price_darai: number | null; // цена в DARAI (null = нельзя за DARAI)
  // Один произвольный FT-токен экосистемы (symbol из reward_tokens) + цена в нём.
  price_token_symbol: string | null;
  price_token_amount: number | null;
  daily_limit: number; // покупок в день на аккаунт (0 = без лимита)
  active: boolean;
  sort_order: number;
  created_at: string;
  /** Лестница цен: [{prices:[…]}], каждая ступень — следующая покупка за день. */
  price_steps?: unknown;
};
export type PgEnergyPackPurchase = {
  id: string;
  pack_id: string;
  wallet: string;
  amount: number; // фактически начисленная энергия
  pay_with: "tickets" | "darai" | "token" | "usd";
  tickets_spent: number; // учитывается в computeTickets used
  darai_spent: number;
  token_symbol: string | null;
  token_spent: number | null;
  tx_hash: string | null;
  idempotency_key: string | null;
  created_at: string;
};

export type PgChipPack = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  kind: "standard" | "themed" | "premium" | "specialized" | "seasonal" | "mystic";
  price_darai: number | null;
  price_tickets: number | null;
  price_stars: number | null; // цена в Telegram Stars (null = нельзя за звёзды)
  daily_limit: number;
  total_supply: number | null;
  sold_count: number;
  drop_table: any;
  // Пул призов «Мистического пака» (kind='mystic'): массив взвешенных тиров
  // разных видов (pack/tickets/energy/nft/ft/artifact/hero). null для обычных паков.
  mystic_pool?: any;
  /** Чем подменять этот пак, когда его коллекции выбраны (см. chips-pack-fallback). */
  fallback_pack_id?: string | null;
  active: boolean;
  market_hidden: boolean; // true → только для раздач/наград, не продаётся в маркете
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  created_by_wallet: string | null;
  updated_at: string;
};

// Артефакты/герои — определения из конструктора (временная схема, потом
// переделаем). kind='artifact'|'hero'; rarity для артефактов, level для героев.
export type PgMysticItemTemplate = {
  id: string;
  kind: "artifact" | "hero";
  name: string;
  description: string | null;
  image_url: string | null;
  rarity: string | null;
  level: number | null;
  race: string | null; // раса (Кабаны/Пчелы/…) — герой; артефакт: бонус расе
  specialization: string | null; // спец (Воин/Маг/…) — герой; артефакт: бонус спец
  // Артефакты (структура):
  land: string | null; // земля (Mystical/…)
  stat_type: string | null; // характеристика (Armor/Intellect/…)
  stat_amount: number | null; // + количество к характеристике
  race_amount: number | null; // + количество к расе
  spec_amount: number | null; // + количество к спец
  land_amount: number | null; // + количество на своей земле
  fish_bonus_pct?: number | null; // бонус к рыбалке, % к базе шанса (fish-03)
  immunities: any | null; // jsonb: массив иммунитетов
  slot: string | null; // слот (Голова/Тело/…)
  meta: any | null;
  active: boolean;
  created_at: string;
  created_by_wallet: string | null;
};
// Экземпляры предметов у игрока (инвентарь).
export type PgUserGameItem = {
  id: string;
  // Владелец — аккаунт; адрес остаётся справочно.
  account_id: string;
  wallet: string;
  template_id: string;
  kind: string;
  source: string | null;
  obtained_at: string;
};

// Настройка «фишка → герой» на коллекцию: какая раса, веса специализаций, пул
// hero-шаблонов, откуда роллится герой при конвертации фишки этой коллекции.
export type PgChipCollectionHero = {
  collection_id: string;
  active: boolean;
  race: string | null;
  spec_weights: any | null; // jsonb: [{spec, weight}]
  hero_template_ids: any | null; // jsonb: [templateId]
  updated_at: string;
  created_by_wallet: string | null;
};

// Экземпляр героя у игрока. Характеристики тут НЕ хранятся — считаются из
// расы/специализации шаблона и уровня (lib/heroStats), чтобы правка баланса
// не требовала миграции данных.
export type PgHeroInstance = {
  id: string;
  // Владелец — аккаунт; адрес остаётся справочно.
  account_id: string;
  wallet: string;
  template_id: string;
  /** Копия предмета-героя, из которой этот экземпляр (NULL у старых записей). */
  item_id: string | null;
  rarity: string; // common | rare | epic | legendary
  level: number;
  likes_spent: number;
  equipped: any; // jsonb: { [slot]: itemId }
  source: string | null;
  source_chip_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PgUserChipInventory = {
  id: string;
  // Владелец — аккаунт; адрес остаётся справочно.
  account_id: string;
  wallet: string;
  collection_id: string;
  template_id: string;
  level: number;
  source: string;
  source_grant_id: string | null;
  status: "owned" | "listed" | "locked" | "burned";
  obtained_at: string;
  updated_at: string;
  serial_no: number | null;
  // Час отдыха (анти-карусель): при ПЕРЕДАЧЕ фишки другому юзеру (маркет/PvP/
  // ввод NFT/аукцион) ставится now()+1ч. Пока rest_until > now() — фишка НЕактивна
  // (нельзя в бой/крафт/продажу/вывод), серая + таймер. Пак/прокачка НЕ ставят.
  rest_until: string | null;
};

// PvE «Босс» — конфиг босса недели + логи боёв.
export type PgChipBoss = {
  id: string;
  name: string;
  image_url: string | null;
  max_hp: number;
  current_hp: number;
  energy_cost: number;
  dmg_base: number;
  dmg_growth: number;
  dmg_variance: number;
  like_threshold: number;
  like_reward: number;
  active: boolean;
  killed_at: string | null;
  week_no: number;
  week_started_at: string;
  reward_tiers: any;
  hp_growth_pct: number;
  ordinal: number | null;
  queue_status: string | null; // 'defeated' | 'active' | 'upcoming' | 'paused' (главный, вытесненный мини-боссом)
  is_mini: boolean; // мини-босс: разовое событие, выпускается вручную, вытесняет главного
  created_at: string;
};
export type PgChipBossRun = {
  id: string;
  boss_id: string;
  // Боец — аккаунт (колонка NOT NULL); адрес остаётся справочно.
  account_id: string;
  wallet: string;
  damage: number;
  rounds: number;
  killed: boolean;
  like_awarded: number;
  week_no: number;
  created_at: string;
};
export type PgChipBossReward = {
  id: string;
  boss_id: string;
  week_no: number;
  // Получатель — аккаунт; адрес справочно и может быть пустым.
  account_id: string;
  wallet: string | null;
  place: number;
  damage: number;
  reward_kind: string;
  reward_amount: number;
  pack_id: string | null;
  claimed_at: string | null;
  created_at: string;
};
export type PgChipBossSession = {
  id: string;
  wallet: string;
  boss_id: string;
  week_no: number;
  state: any;
  status: string;
  created_at: string;
  updated_at: string | null;
};

// ─── Рейд-локации (параллельная надстройка над боссом) ───
export type PgRaidLocation = {
  id: string;
  name: string;
  image_url: string | null;
  active: boolean;
  cycle_no: number;
  cycle_started_at: string;
  reward_tiers: any;
  fork_node_id: string | null;
  in_hub: boolean; // показывать на стартовом перекрёстке (хабе)
  difficulty: string | null; // 'newbie' | 'medium' | 'hard' — плашка сложности
  created_at: string;
};
export type PgRaidForkLink = {
  id: string;
  fork_node_id: string;
  target_location_id: string;
  ordinal: number;
  created_at: string;
};
export type PgRaidNode = {
  id: string;
  location_id: string;
  branch_key: string; // 'root' | 'A' | 'B'
  ordinal: number;
  node_type: string; // 'boss' | 'chest_normal' | 'chest_op' | 'fork' | 'final'
  boss_id: string | null; // FK→chip_boss.id (для boss/final)
  chest_config: any; // пул наград сундука
  is_final: boolean;
  image_url: string | null; // картинка узла (для развилки — сцена выбора)
  created_at: string;
};
export type PgRaidPosition = {
  account_id: string;
  wallet: string; // каноникал-кош TG-группы
  location_id: string;
  node_id: string;
  cycle_no: number;
  cleared_final_branches: string[] | null;
  updated_at: string;
};
export type PgRaidChestOpen = {
  id: string;
  account_id: string;
  wallet: string;
  node_id: string;
  cycle_no: number;
  reward_kind: string | null;
  reward_amount: number | null;
  pack_id: string | null;
  created_at: string;
};
export type PgRaidBossTemplate = {
  id: string;
  name: string;
  image_url: string | null;
  max_hp: number;
  reward_tiers: any;
  created_at: string;
  /** Уровень босса 1..100 — по нему их отбирают и восстанавливают. */
  level?: number;
};
export type PgRaidMap = {
  id: string;
  name: string;
  size: number;
  location_id: string | null;
  routes: unknown[];
  created_at: string;
  updated_at: string;
};
export type PgRaidMapCell = {
  map_id: string;
  q: number;
  r: number;
  terrain_id: string | null;
  road_id: string | null;
  object_id: string | null;
  object_config: unknown;
  decoration_id?: string | null;
  /** Постройка на клетке и её настройки (у дерева — цены прокачки). */
  building_id?: string | null;
  building_config?: unknown;
  /** Купол глухого тумана ПОВЕРХ клетки — не тип местности и не слой. */
  void_fog?: boolean | null;
  /** Метка сохранения карты: по ней вычищаются стёртые клетки. */
  saved_at?: string | null;
};
export type PgRaidReward = {
  id: string;
  location_id: string;
  cycle_no: number;
  // Владелец награды — аккаунт; адрес пишется справочно и может быть пустым.
  account_id: string;
  wallet: string | null;
  place: number | null;
  damage: number | null;
  reward_kind: string;
  reward_amount: number | null;
  pack_id: string | null;
  claimed_at: string | null;
  created_at: string;
  boss_id: string | null; // NULL = турнир локации; set = награда за килл этого босса
};

export type PgUserEnergy = {
  wallet: string;
  energy: number;
  max_energy: number;
  last_updated_at: string;
};

export type PgChipEconomySpend = {
  id: string;
  wallet: string;
  amount: number;
  source: "craft" | "pack_buy";
  source_ref: string | null;
  created_at: string;
};

// Журнал потраченных билетов на крафт фишек. После миграции с $DARAI
// на билеты — это аналог chip_economy_spend для крафта. amount — дробный
// (0.03, 0.07, 0.28 …); сумма по sister-wallets вычитается из доступных
// билетов в computeTickets().
export type PgChipCraftTicketSpend = {
  id: string;
  wallet: string;
  amount: number;
  base_chip_id: string | null;
  new_chip_id: string | null;
  created_at: string;
};

export type PgChipPackGrant = {
  id: string;
  // Владелец — аккаунт; адрес остаётся справочно.
  account_id: string;
  wallet: string;
  chip_pack_id: string;
  source:
    | "purchase_darai"
    | "purchase_tickets"
    | "event"
    | "admin"
    | "referral"
    | "nft_holder"
    | "achievement"
    | "battle_pass"
    | "nft_input";
  source_ref: string | null;
  granted_at: string;
  opened_at: string | null;
  result_chips: any | null;
  tickets_spent: number;
};

// ──────── Паки (loot-boxes) ────────
export type PgNftPack = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by_wallet: string;
  created_at: string;
  updated_at: string;
  active: boolean;
};

export type PgNftPackItem = {
  id: string;
  pack_id: string;
  kind: "nft" | "ft";
  nft_contract: string | null;
  nft_title: string | null;
  ft_token: string | null;
  ft_min: number | null;
  ft_max: number | null;
  chance_pct: number;
  sort_order: number;
  created_at: string;
};

export type PgUserPackInventory = {
  id: string;
  account_id: string;
  wallet: string;
  pack_id: string;
  status: "unopened" | "opened";
  source: string;
  source_ref: string | null;
  obtained_at: string;
  opened_at: string | null;
  result_kind: "nft" | "ft" | "molodec" | null;
  result_nft_title: string | null;
  result_nft_token_id: string | null;
  result_nft_redemption_id: string | null;
  result_ft_token: string | null;
  result_ft_amount: number | null;
  result_ft_redemption_id: string | null;
};

export type PgLikeShopOffer = {
  id: string;
  tickets: number;
  likes: number;
  price_stars: number | null; // цена в Telegram Stars (null = нельзя за звёзды)
  /** Тариф в $ (07.10.2026): USDT / DARAI / Stars считаются от него по курсу. */
  price_usd?: number | string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type PgLikePromocode = {
  id: string;
  code: string;
  reward_min: number;
  reward_max: number;
  limit_type: "budget" | "uses";
  total_budget: number | null;
  max_uses: number | null;
  used_budget: number;
  used_count: number;
  active: boolean;
  created_by_wallet: string;
  created_at: string;
};

export type PgLikePromocodeActivation = {
  id: string;
  promocode_id: string;
  wallet: string;
  telegram_id: number | null;
  likes_awarded: number;
  activated_at: string;
};

// ──────── Лайки за NFT (голосование за следующий дроп) ────────
export type PgNftLikeCandidate = {
  id: string;
  contract_id: string;
  normalized_title: string;
  display_title: string;
  image_url: string | null;
  collection_count: number | null;
  target_likes: number;
  current_likes: number;
  status: "pending" | "ready" | "completed" | "cancelled";
  completed_drop_id: string | null;
  created_by_wallet: string;
  created_at: string;
  updated_at: string;
  notified_at: string | null;
  /** Номер цикла голосования для этой NFT (contract+title). На каждом
   *  следующем цикле порог × 2^(cycle_no-1). 1 = первый цикл, 2 = ×2 и т.д. */
  cycle_no: number;
};

export type PgNftLike = {
  id: string;
  candidate_id: string;
  wallet: string;
  count: number; // 1..5
  created_at: string;
  updated_at: string;
};

export type PgUserLikeBalance = {
  // Владелец — аккаунт. Адрес остаётся справочно и может быть пустым: у
  // игрока, зашедшего без кошелька, его попросту нет.
  account_id: string;
  wallet: string | null;
  available: number;
  last_daily_grant_at: string | null;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  updated_at: string;
};

export type PgLikePurchase = {
  id: string;
  wallet: string;
  tickets_spent: number;
  likes_added: number;
  idempotency_key: string | null;
  created_at: string;
};

// ──────── Hallway (Прихожая) ────────
//
// Состояние Юпика пользователя.
export type PgHallwayYupik = {
  account_id: string;
  wallet: string;
  telegram_id: number | null;
  level: number;
  exp: number;
  awareness: number; // спендабельный баланс осознанности (тап→+, сундук→−)
  // v2: server-authoritative состояние прихожи
  tap_pool: number; // доступные ТАПЫ (реген-лимит)
  last_regen_at: string; // якорь начисления регена
  chest_open_count: number; // для динамической цены сундука
  pending_chests: number; // неоткрытые сундуки в инвентаре (юзер открывает сам)
  marathon_day: number; // текущий день марафона (0..30)
  marathon_reward_days: number[]; // дни, чью фишку/сундук уже выдали (только раз)
  marathon_last_claim_day: string | null; // UTC-дата последнего клейма (стрик)
  released: boolean; // выпущен в игру (добыча off)
  released_at: string | null;
  released_tickets: number; // сколько билетов начислено при выпуске (аудит cap)
  // legacy (v1, больше не используются — dead после сноса)
  last_collect_at: string | null;
  last_petting_at: string | null;
  last_daily_at: string | null;
  created_at: string;
  updated_at: string;
};

// Конфиг уровня (картинка Юпика, EXP до следующего, окно сбора в часах).
export type PgHallwayLevel = {
  level_no: number;
  yupik_image_url: string | null;
  mine_per_collect: number; // dead (v1, тап-based теперь)
  exp_to_next: number;
  window_hours: number; // окно сбора (тап-пул = window_hours × реген × 60)
  updated_at: string;
};

// v2: отдельная триал-коллекция фишек прихожи. НЕ пересекается с
// user_chip_inventory / chip_market / withdraw / craft. star ∈ {1,1.5,2,2.5,3}.
export type PgHallwayTrainingChip = {
  id: string;
  account_id: string;
  wallet: string;
  telegram_id: number | null;
  star: number;
  source: string; // 'chest' | 'marathon'
  obtained_at: string;
  consumed_at: string | null; // проставляется при конверте на выпуске
};

// Шаблон сундука. contents — JSONB массив призов с весами:
//   [{ kind: "exp" | "awareness" | "token", minAmount, maxAmount, weight, tokenSymbol? }]
export type PgHallwayChest = {
  id: string;
  name: string;
  image_url: string | null;
  cost_awareness: number;
  contents: any;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Задание. kind: "connect_wallet" | "connect_telegram" | "manual" |
//                "external_link" | "tg_subscribe"
// reward_chest_id — выдать сундук (опционально), reward_exp — выдать EXP.
// url — внешняя ссылка для перехода (external_link / tg_subscribe).
// verify_chat_id — @username / id канала для проверки подписки
//                  (tg_subscribe, опционально — если пусто, trust-based).
export type PgHallwayTask = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  reward_chest_id: string | null;
  reward_exp: number;
  enabled: boolean;
  sort_order: number;
  url: string | null;
  verify_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

// Кто выполнил какое задание.
export type PgHallwayTaskCompletion = {
  id: string;
  wallet: string;
  task_id: string;
  completed_at: string;
};

// Лог открытий сундуков.
export type PgHallwayChestOpening = {
  id: string;
  wallet: string;
  chest_id: string;
  prize_kind: string;
  prize_amount: number;
  prize_token: string | null;
  source: string; // "purchase" | "task" | ...
  source_ref: string | null;
  opened_at: string;
};

// Pending-награды на блокчейн из супер-сундука (для вывода).
export type PgHallwayBlockchainReward = {
  id: string;
  wallet: string;
  token: string;
  amount: number;
  status: "pending" | "withdrawn";
  tx_hash: string | null;
  created_at: string;
  withdrawn_at: string | null;
};

// Маркетплейс фишек: выставленные на продажу.
export type PgChipMarketListing = {
  id: string;
  // Владелец листинга — аккаунт; адреса остаются справочно.
  seller_account: string;
  buyer_account: string | null;
  seller_wallet: string;
  // nullable: при сжигании фишки в крафте FK → SET NULL (историческая
  // sold-запись остаётся, но экземпляр фишки уже не существует). Раньше
  // здесь был ON DELETE CASCADE — дыра, возвращавшая билеты (см.
  // migrate-market-cascade-fix).
  chip_id: string | null;
  price_tickets: number;
  status: "active" | "sold" | "cancelled";
  buyer_wallet: string | null;
  sold_price_tickets: number | null;
  created_at: string;
  sold_at: string | null;
};

// Журнал движений билетов по сделкам маркета.
//   spend  — покупатель потратил price
//   earned — продавец получил price × 0.91
//   fee    — комиссия 9% (wallet='_market_fees')
export type PgChipMarketLedger = {
  id: string;
  // nullable: ledger — вечная финансовая история сделки. Если listing
  // когда-либо удалят, FK → SET NULL (запись о движении билетов остаётся).
  listing_id: string | null;
  wallet: string;
  kind: "spend" | "earned" | "fee";
  amount_tickets: number;
  created_at: string;
};

// Immutable аудит-снимок каждой состоявшейся сделки маркета. БЕЗ внешних
// ключей — переживает и удаление листинга, и сжигание фишки. Заведён после
// инцидента 05.07 (каскад стирал историю → нельзя было восстановить сделки).
export type PgChipMarketAudit = {
  id: string;
  listing_id: string;
  chip_id: string;
  seller_wallet: string;
  buyer_wallet: string;
  price_tickets: number;
  seller_got_tickets: number;
  fee_tickets: number;
  created_at: string;
};

// Виртуальный «кошелёк», на котором накапливается комиссия маркета.
// Используется как wallet в chip_market_ledger.kind='fee'.
export const MARKET_FEES_WALLET = "_market_fees";

// Батч-выплаты от админа: одна заявка → один TG-confirm → одна (или
// несколько chunked) batch-tx с N ft_transfer'ами.
export type PgAdminBatchPayoutPending = {
  id: string;
  ft_contract: string;
  reward_symbol: string;
  decimals: number;
  items: Array<{ recipient: string; amount_human: number; tag?: string }>;
  total_human: number;
  reason: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected" | "done" | "failed";
  tg_message_ids: Record<string, number> | null;
  tx_hashes: string[] | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

// Сундуки в инвентаре юзера (выданы за задания, открываются бесплатно).
export type PgHallwayChestInventory = {
  wallet: string;
  chest_id: string;
  count: number;
  updated_at: string;
};

// PvP-бой фишек. На create фишки создателя залочены; на join — резолв
// по парам (см. chipsPvp.ts), winner забирает проигравшие фишки соперника.
export type PgChipPvpBattle = {
  id: string;
  // Боец — аккаунт; адреса остаются справочно.
  creator_account: string;
  opponent_account: string | null;
  creator_wallet: string;
  creator_chip_ids: string[];
  opponent_wallet: string | null;
  opponent_chip_ids: string[] | null;
  status: "open" | "done" | "cancelled";
  pairs: Array<{
    creatorChipId: string;
    opponentChipId: string;
    creatorStr: number;
    opponentStr: number;
    winnerSide: "creator" | "opponent" | "draw";
  }> | null;
  created_at: string;
  resolved_at: string | null;
};

// Прямой клиент — для случаев когда нужны RPC, JOIN'ы, IN-фильтры и пр.
export { sb as supabase };
