// Точечные вопросы к Sendler про КОНКРЕТНЫЙ токен.
//
// Зачем отдельно от sendler.ts: тот умеет только «покажи историю кошелька»
// (/history/nft-user-history). У этого способа два слепых пятна — окно в 200
// последних записей и задержка индексации, — и оба выглядят одинаково: ответ
// 200 и пустой список. Исключения нет, поэтому ввод молча считал перевод
// несостоявшимся.
//
// Здесь способ спросить про один токен напрямую: лента событий самого токена.
// Она не зависит от того, сколько всего дел у кошелька и влезло ли наше в
// последние 200.
//
// Владельца токена (/nft/by-token-ids/) намеренно НЕ спрашиваем: по нему не
// видно, КТО прислал NFT, и на «оно у нас — значит выдаём» можно было бы
// присвоить чужой перевод.
import { fetchWithRetry } from "./sendler";

const ROOT = "https://api.sendler.xyz";

function apiKey(): string {
  const k = process.env.SENDLER_API_KEY;
  if (!k) throw new Error("SENDLER_API_KEY не сконфигурирован");
  return k;
}

function headers(): Record<string, string> {
  return { accept: "application/json", "X-API-Key": apiKey() };
}

/** Одно событие в жизни токена: минт, перевод, выставление, продажа. */
export interface SendlerTokenAction {
  action_type?: string;
  method?: string;
  contract_id?: string;
  token_id?: string;
  sender_id?: string;
  receiver_id?: string;
  tx_hash?: string;
  block_timestamp?: string;
  /** ObjectId записи: первые 4 байта — момент, когда Sendler её вставил. */
  _id?: string;
}

/**
 * Переводы конкретного токена, свежие сверху. Хранится 90 дней — вводу этого
 * хватает с запасом, он разбирает переводы последних минут.
 */
export async function fetchTokenTransfers(
  contract: string,
  tokenId: string,
  limit = 20,
): Promise<SendlerTokenAction[]> {
  const url = new URL(
    `${ROOT}/v2/market/nft/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}/activity`,
  );
  url.searchParams.set("action_type", "transfer");
  url.searchParams.set("limit", String(Math.min(limit, 500)));
  // Две попытки, а не четыре: этот вызов живёт внутри цикла ожидания, и
  // собственный долгий ретрай съел бы чужой шаг ожидания.
  const res = await fetchWithRetry(url.toString(), { headers: headers() }, 2);
  if (!res.ok) throw new Error(`Sendler /v2/market/nft/../activity: ${res.status}`);
  const j = (await res.json()) as { items?: SendlerTokenAction[] };
  return j.items ?? [];
}
