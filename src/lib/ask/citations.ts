import { getDocumentUrl } from '../documents/registry';
import type { AskCitation } from './client';

/** Signed URL for a citation's source PDF with a page anchor, or null when unavailable. */
export async function citationHref(c: AskCitation): Promise<string | null> {
  if (!c.storage_path) return null;
  const url = await getDocumentUrl(c.storage_path);
  if (!url) return null;
  return `${url}#page=${c.page_start}`;
}
