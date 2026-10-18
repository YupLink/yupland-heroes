// Расклад награды по местам: что достанется 1-му, 2-му, …, N-му месту.
//
// Раньше игрок видел только фонд целиком («250 лайков») и отдельной россыпью
// проценты («1 25% 2 15% …») — свою долю за конкретное место приходилось
// считать в уме. Здесь тот же расчёт, что у реальной раздачи
// (server/api/beta-raid/encounter-share.ts → moneyByPlace) для ПОЛНОГО состава:
// доли нормируются по сумме split. Если бивших меньше, чем мест, сервер
// доливает доли пустых мест участникам — фактическая выдача будет не меньше.
//
// Клиентский модуль: никаких серверных импортов (см. правило про утечку
// server-модулей в бандл).

export type RewardCfgLike = {
  fillers?: Array<{
    kind: string;
    amount: number;
    token?: string | null;
    /** kind='resource' — код ресурса счёта (gold/stone/wood/diamonds). */
    resource?: string | null;
    /** kind='custom' — шаблон своего товара; имя и картинку кладёт сервер. */
    itemId?: string | null;
    toPlace?: number | null;
    name?: string;
    imageUrl?: string | null;
  }>;
  split?: number[];
  packs?: Array<{ packId: string; toPlace: number; name?: string; imageUrl?: string | null }>;
  items?: Array<{
    itemTemplateId: string;
    toPlace: number;
    name?: string;
    imageUrl?: string | null;
  }>;
};

export type PlaceReward = {
  place: number;
  /** Доля фонда этого места в процентах (не округлённая). */
  sharePct: number;
  /** Делимая часть: лайки, энергия, токены, ресурсы (билеты в UI не показываем). */
  fillers: Array<{ kind: string; amount: number; resource?: string | null }>;
  /** Штучное: паки, предметы и свои товары «до места N». */
  prizes: Array<{
    kind: "pack" | "item" | "custom";
    name: string;
    imageUrl: string | null;
    /** Сколько штук за место. У пака и предмета всегда 1. */
    amount: number;
  }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Нормированные доли мест: индекс — место минус один. */
export function placeShares(split: number[] | undefined): number[] {
  const raw = (Array.isArray(split) ? split : []).map((x) => Number(x) || 0);
  const sum = raw.reduce((a, x) => a + x, 0);
  return sum > 0 ? raw.map((x) => x / sum) : raw.map(() => 0);
}

/** Строки «место → награда». Пустые места (ничего не достаётся) пропускаем. */
export function rewardByPlace(cfg: RewardCfgLike | null | undefined): PlaceReward[] {
  if (!cfg) return [];
  const shares = placeShares(cfg.split);
  const all = (Array.isArray(cfg.fillers) ? cfg.fillers : []).filter(
    (f) => f.kind !== "tickets" && Number(f.amount) > 0,
  );
  // Свой товар не делится долями: он штучный, «до места N», как пак
  // (см. server/api/beta-raid/encounter-extra.ts — те же правила).
  const fillers = all.filter((f) => f.kind !== "custom");
  const customs = all.filter((f) => f.kind === "custom" && !!f.itemId);
  const packs = (Array.isArray(cfg.packs) ? cfg.packs : []).filter(
    (p) => p.packId && p.toPlace > 0,
  );
  const items = (Array.isArray(cfg.items) ? cfg.items : []).filter(
    (i) => i.itemTemplateId && i.toPlace > 0,
  );

  // Штучное раздаётся «до места N» независимо от длины split: пресет
  // «Победитель» (split=[100]) с паком до 10-го места выдаёт пак десяти —
  // значит и в столбике этих мест должно быть видно.
  const maxPlace = Math.max(
    shares.length,
    ...packs.map((p) => p.toPlace),
    ...items.map((i) => i.toPlace),
    ...customs.map((c) => Math.max(1, Math.floor(Number(c.toPlace) || 1))),
    0,
  );

  const out: PlaceReward[] = [];
  for (let i = 0; i < maxPlace; i++) {
    const place = i + 1;
    const share = shares[i] ?? 0;
    const row: PlaceReward["fillers"] = [];
    for (const f of fillers) {
      const amt = round2(Number(f.amount) * share);
      // Энергия и ресурсы счёта целочисленные — как в раздаче.
      const whole = f.kind === "energy" || f.kind === "resource";
      const value = whole ? Math.round(amt) : amt;
      if (!(value > 0)) continue;
      // Токен и ресурс показываем СОБСТВЕННЫМ именем: «GDarai», «gold» —
      // подписи и иконки для них у клиента уже есть, а «token»/«resource»
      // игроку ничего не говорят.
      const kind =
        f.kind === "token" && f.token
          ? f.token
          : f.kind === "resource" && f.resource
            ? f.resource
            : f.kind;
      // resource-код для kindLabel: если kind уже заменён на «gold» — он и нужен,
      // а если нет (resource=null) — передаём исходный resource как fallback.
      const res = f.kind === "resource" ? f.resource ?? null : null;
      row.push({ kind, amount: value, resource: res });
    }
    const prizes: PlaceReward["prizes"] = [
      ...packs
        .filter((p) => p.toPlace >= place)
        .map((p) => ({
          kind: "pack" as const,
          name: p.name ?? p.packId,
          imageUrl: p.imageUrl ?? null,
          amount: 1,
        })),
      ...items
        .filter((it) => it.toPlace >= place)
        .map((it) => ({
          kind: "item" as const,
          name: it.name ?? it.itemTemplateId,
          imageUrl: it.imageUrl ?? null,
          amount: 1,
        })),
      ...customs
        .filter((c) => Math.max(1, Math.floor(Number(c.toPlace) || 1)) >= place)
        .map((c) => ({
          kind: "custom" as const,
          name: c.name ?? c.itemId ?? "",
          imageUrl: c.imageUrl ?? null,
          amount: Math.max(1, Math.floor(Number(c.amount) || 1)),
        })),
    ];
    if (row.length === 0 && prizes.length === 0) continue;
    out.push({ place, sharePct: share * 100, fillers: row, prizes });
  }
  return out;
}

/** Сколько мест реально участвует в дележе фонда. */
export function paidPlaces(split: number[] | undefined): number {
  return (Array.isArray(split) ? split : []).filter((x) => Number(x) > 0).length;
}

/** Числа наград: тысячи — с разделителями, дроби — до сотых («61,27», «1 250»). */
export function shortAmount(n: number, locale = "ru-RU"): string {
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** Доля места: «25%», мелкие — «0,5%». Место вне split доли не имеет. */
export function pctLabel(pct: number, locale = "ru-RU"): string {
  if (!(pct > 0)) return "—";
  const v = pct >= 1 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${v.toLocaleString(locale)}%`;
}
