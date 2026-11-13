// YUPLINK · Майлстоун-алерт казны DARAI.
//
// Когда баланс DARAI на системном коше darai_gdrop.near пересекает
// очередной миллиард (1 млрд, 2 млрд, …) — шлём ЗАМЕТНОЕ TG-уведомление
// ТОЛЬКО владельцу (TEAM_OWNER_WALLET), по требованию «оповести только меня».
//
// Дедуп: в settings храним последний уже-оповещённый миллиард
// (darai_treasury_notified_billions). Шлём один раз на каждый рубеж —
// повторно на том же миллиарде не дёргаем.
//
// Запускается из ежедневного крона (api.cron.chips-stock-alert), поэтому
// отдельной crontab-записи на сервере не требует.

import { pg } from "./db/pg";
import { tgSendMessage, WEBAPP_URL } from "./tg";
import { teamOwnerWallet } from "./team";

const DARAI_FT_CONTRACT = "darai.tkn.near";
const DARAI_DECIMALS = 18;
const TREASURY_WALLET = "darai_gdrop.near";
const SETTINGS_KEY = "darai_treasury_notified_billions";
const BILLION = 1_000_000_000;

/** Баланс DARAI на казне (целые DARAI, округление вниз). */
async function fetchTreasuryDaraiHuman(): Promise<number> {
  const { nearRpc } = await import("./rpc");
  const argsB64 = Buffer.from(
    JSON.stringify({ account_id: TREASURY_WALLET })
  ).toString("base64");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: DARAI_FT_CONTRACT,
    method_name: "ft_balance_of",
    args_base64: argsB64,
  });
  const bytes = r.result?.result;
  if (!bytes || bytes.length === 0) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf-8"));
    const raw = typeof parsed === "string" ? BigInt(parsed) : 0n;
    return Number(raw / 10n ** BigInt(DARAI_DECIMALS));
  } catch {
    return 0;
  }
}

/** telegram_id владельца: env OWNER_TG_ID (жёсткий канал) → users по кошельку владельца (server/team). */
async function resolveOwnerTgId(): Promise<number | null> {
  const envId = Number((process.env.OWNER_TG_ID ?? "").trim());
  if (Number.isFinite(envId) && envId > 0) return envId;
  const ownerWallet = teamOwnerWallet();
  if (!ownerWallet) return null;
  const row = await pg.users.findOne({ wallet: ownerWallet });
  return typeof row?.telegram_id === "number" ? row.telegram_id : null;
}

/**
 * Проверяет казну и, если пройден новый миллиардный рубеж, шлёт владельцу
 * заметный TG-алерт. Идемпотентно между рубежами (дедуп через settings).
 *
 * @param opts.dryRun — не шлём и не пишем settings, только считаем (для теста).
 */
export async function checkDaraiMilestone(
  opts: { dryRun?: boolean } = {}
): Promise<{
  human: number;
  currentBillions: number;
  notifiedBillions: number;
  fired: boolean;
  sent: boolean;
}> {
  const human = await fetchTreasuryDaraiHuman();
  const currentBillions = Math.floor(human / BILLION);

  const stRow = await pg.settings.findOne({ key: SETTINGS_KEY });
  const notifiedBillions = Number(stRow?.value ?? 0) || 0;

  if (currentBillions <= notifiedBillions) {
    return { human, currentBillions, notifiedBillions, fired: false, sent: false };
  }

  // Пройден новый рубеж. Собираем ЗАМЕТНОЕ сообщение.
  const humanFmt = human.toLocaleString("ru-RU");
  const milestoneFmt = currentBillions.toLocaleString("ru-RU");
  const text =
    `🎉🎉🎉 <b>${milestoneFmt} МЛРД DARAI!</b> 🎉🎉🎉\n\n` +
    `💰 На казне <code>${TREASURY_WALLET}</code> уже\n` +
    `<b>${humanFmt} DARAI</b>.\n\n` +
    `📈 Пройден рубеж <b>${milestoneFmt} млрд</b>. Можно запускать раздачу 🚀`;

  let sent = false;
  if (!opts.dryRun) {
    const tgId = await resolveOwnerTgId();
    if (tgId) {
      sent = await tgSendMessage(tgId, text, {
        // disableNotification: false → со звуком, чтобы «пришло заметно».
        disableNotification: false,
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Открыть раздачу",
                web_app: { url: `${WEBAPP_URL}/admin/payouts` },
              },
            ],
          ],
        },
      });
    } else {
      console.warn(
        "[daraiMilestone] telegram_id владельца не найден (TEAM_OWNER_WALLET / OWNER_TG_ID)"
      );
    }
    // Фиксируем достигнутый рубеж — даже если отправка не удалась, чтобы
    // не спамить каждый прогон; при провале отправки будет видно в логах.
    await pg.settings.upsert(
      { key: SETTINGS_KEY, value: String(currentBillions) },
      { onConflict: "key" }
    );
  }

  return { human, currentBillions, notifiedBillions, fired: true, sent };
}
