// Формат транзакции NEAR (borsh-схемы) и конструкторы действий. Вынесено из
// nearSafe.ts ради лимита ≤250 строк; nearSafe реэкспортирует конструкторы.
import * as borsh from "borsh";

// ──────── Borsh schemas (NEAR transaction format) ────────

const PUBLIC_KEY_SCHEMA: borsh.Schema = {
  struct: { keyType: "u8", data: { array: { type: "u8", len: 32 } } },
};
const SIGNATURE_SCHEMA: borsh.Schema = {
  struct: { keyType: "u8", data: { array: { type: "u8", len: 64 } } },
};
const TRANSFER_ACTION_SCHEMA: borsh.Schema = {
  struct: { deposit: "u128" },
};
const FUNCTION_CALL_ACTION_SCHEMA: borsh.Schema = {
  struct: {
    methodName: "string",
    args: { array: { type: "u8" } },
    gas: "u64",
    deposit: "u128",
  },
};
const ACTION_SCHEMA: borsh.Schema = {
  enum: [
    { struct: { CreateAccount: { struct: {} } } },
    {
      struct: {
        DeployContract: { struct: { code: { array: { type: "u8" } } } },
      },
    },
    { struct: { FunctionCall: FUNCTION_CALL_ACTION_SCHEMA } },
    { struct: { Transfer: TRANSFER_ACTION_SCHEMA } },
    {
      struct: {
        Stake: { struct: { stake: "u128", publicKey: PUBLIC_KEY_SCHEMA } },
      },
    },
    { struct: { AddKey: { struct: {} } } },
    {
      struct: {
        DeleteKey: { struct: { publicKey: PUBLIC_KEY_SCHEMA } },
      },
    },
    {
      struct: {
        DeleteAccount: { struct: { beneficiaryId: "string" } },
      },
    },
  ],
};
export const TRANSACTION_SCHEMA: borsh.Schema = {
  struct: {
    signerId: "string",
    publicKey: PUBLIC_KEY_SCHEMA,
    nonce: "u64",
    receiverId: "string",
    blockHash: { array: { type: "u8", len: 32 } },
    actions: { array: { type: ACTION_SCHEMA } },
  },
};
export const SIGNED_TRANSACTION_SCHEMA: borsh.Schema = {
  struct: {
    transaction: TRANSACTION_SCHEMA,
    signature: SIGNATURE_SCHEMA,
  },
};

// ──────── Action constructors ────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NearAction = any;

export function functionCallAction(opts: {
  methodName: string;
  args: object;
  gas: bigint;
  deposit: bigint;
}): NearAction {
  return {
    FunctionCall: {
      methodName: opts.methodName,
      args: Array.from(new TextEncoder().encode(JSON.stringify(opts.args))),
      gas: opts.gas,
      deposit: opts.deposit,
    },
  };
}

// ──────── Helpers для конкретных операций ────────

const FT_TRANSFER_GAS = 30_000_000_000_000n;
const FT_TRANSFER_DEPOSIT = 1n;

export function ftTransferAction(opts: {
  receiverId: string;
  rawAmount: string;
  memo?: string;
}): NearAction {
  return functionCallAction({
    methodName: "ft_transfer",
    args: {
      receiver_id: opts.receiverId,
      amount: opts.rawAmount,
      memo: opts.memo ?? "yuplink redemption",
    },
    gas: FT_TRANSFER_GAS,
    deposit: FT_TRANSFER_DEPOSIT,
  });
}
