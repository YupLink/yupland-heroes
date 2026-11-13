/** UI-only bridge for the account layout API. It never uploads a legacy scene on load. */
export type LayoutSnapshot<Entry> = { revision: number; layout: Entry[] | null };
export type SaveResult<Entry> =
  | { ok: true; revision: number }
  | { ok: false; conflict: true; revision: number; layout: Entry[] | null };

export type LayoutTransport<Entry> = {
  load(): Promise<LayoutSnapshot<Entry>>;
  save(input: { revision: number; layout: Entry[] }): Promise<SaveResult<Entry>>;
};

export type LayoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LocalCandidate<Entry> = { source: "draft" | "legacy"; layout: Entry[] };

const legacyKey = "castle-modular-layout-v1";
export const draftKey = (accountId: string) =>
  `castle-layout-draft:v2:${encodeURIComponent(accountId)}`;

function parseEntries<Entry>(raw: string | null): Entry[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value as Entry[] : null;
  } catch {
    return null;
  }
}

/** Drafts are account scoped; the old shared key stays unowned until explicit restore. */
export function localCandidate<Entry>(storage: LayoutStorage, accountId: string): LocalCandidate<Entry> | null {
  const draft = parseEntries<Entry>(storage.getItem(draftKey(accountId)));
  if (draft !== null) return { source: "draft", layout: draft };
  const legacy = parseEntries<Entry>(storage.getItem(legacyKey));
  return legacy === null ? null : { source: "legacy", layout: legacy };
}

export async function loadAccountLayout<Entry>(
  transport: LayoutTransport<Entry>, storage: LayoutStorage, accountId: string,
): Promise<{ remote: LayoutSnapshot<Entry>; candidate: LocalCandidate<Entry> | null }> {
  if (!accountId) throw new Error("Account identity is required before loading the castle layout");
  const remote = await transport.load();
  if (!Number.isSafeInteger(remote.revision) || remote.revision < 0 ||
      (remote.layout !== null && !Array.isArray(remote.layout))) {
    throw new Error("Invalid castle layout response");
  }
  const candidate = localCandidate<Entry>(storage, accountId);
  return {
    remote,
    candidate: candidate && JSON.stringify(candidate.layout) !== JSON.stringify(remote.layout)
      ? candidate : null,
  };
}

export async function saveAccountLayout<Entry>(
  transport: LayoutTransport<Entry>, storage: LayoutStorage, accountId: string,
  revision: number, layout: Entry[],
): Promise<SaveResult<Entry>> {
  if (!accountId || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Loaded account revision is required before saving");
  }
  const key = draftKey(accountId);
  // A failed network call or revision conflict must leave this device's edits recoverable.
  storage.setItem(key, JSON.stringify(layout));
  const result = await transport.save({ revision, layout });
  if (result.ok) storage.removeItem(key);
  return result;
}
