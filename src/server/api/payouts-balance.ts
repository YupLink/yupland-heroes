// YUPLINK · Сколько DARAI лежит на аккаунте. Отдельный модуль, потому что
// читают его двое: экран раздачи и раскладка пулов (darai-pools), а тащить
// ради одного view-вызова весь калькулятор раздачи незачем.

const DARAI_FT_CONTRACT = "darai.tkn.near";

/** Баланс DARAI на аккаунте, в yocto. Пустой ответ контракта = 0. */
export async function fetchDaraiBalance(accountId: string): Promise<bigint> {
  const { nearRpc } = await import("../rpc");
  const argsB64 = Buffer.from(
    JSON.stringify({ account_id: accountId })
  ).toString("base64");
  const r = await nearRpc<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: DARAI_FT_CONTRACT,
    method_name: "ft_balance_of",
    args_base64: argsB64,
  });
  const bytes = r.result?.result;
  if (!bytes || bytes.length === 0) return 0n;
  try {
    const text = Buffer.from(bytes).toString("utf-8");
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? BigInt(parsed) : 0n;
  } catch {
    return 0n;
  }
}
