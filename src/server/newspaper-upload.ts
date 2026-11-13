import {createHash, randomUUID} from 'node:crypto';
import {mkdir, writeFile, link, unlink, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';

export const NEWSPAPER_MAX_BYTES = 8 * 1024 * 1024;
const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);

/** Called only after the existing editor authorization check. Never re-encode. */
export async function storeNewspaperPng(file: File, root: string, base: string) {
  if (!file.size || file.size > NEWSPAPER_MAX_BYTES) throw new Error('PNG: 1 byte–8 MB');
  if (file.type !== 'image/png') throw new Error('PNG required');
  const raw = Buffer.from(await file.arrayBuffer());
  if (!raw.subarray(0,8).equals(SIGNATURE)) throw new Error('Invalid PNG');
  const image = sharp(raw, {limitInputPixels: 16_777_216, failOn: 'warning'});
  const meta = await image.metadata();
  if (meta.format !== 'png' || !meta.width || !meta.height || (meta.pages ?? 1) !== 1) throw new Error('Invalid PNG');
  // Decode fully to reject truncated/corrupt files, but persist the original bytes.
  await image.raw().toBuffer();
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const rel = `tasks/newspapers/${sha256}.png`;
  const dir = join(root, 'tasks/newspapers');
  await mkdir(dir, {recursive:true});
  const temp = join(dir, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, raw, {flag:'wx'});
    try { await link(temp, join(root,rel)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(join(root,rel));
      if (!existing.equals(raw)) throw new Error('Stored PNG integrity mismatch');
    }
  } finally { await unlink(temp).catch(()=>{}); }
  return {url:`${base.replace(/\/+$/, '')}/${rel}`,sha256,width:meta.width,height:meta.height,bytes:raw.length};
}
