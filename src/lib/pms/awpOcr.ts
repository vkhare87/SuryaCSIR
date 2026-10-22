// Browser-only: turns an AWP PDF into plain text for parseAWPText.
// Uses the PDF's own text layer where it has one; scanned pages (one image
// per page) go through tesseract.js, page by page (see awpOcrPages.ts). All assets are served from
// public/tesseract (see scripts/copy-ocr-assets.mjs) — no CDN calls.
// Both libraries are dynamically imported so they stay out of the main bundle.

import { pagesNeedingOcr } from './awpOcrPages';

const RENDER_SCALE = 2.5; // ≈180 dpi for A4 — what tesseract needs for small table text

export interface PdfTextResult {
  text: string;
  usedOcr: boolean;
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfTextResult> {
  const pdfjs = await import('pdfjs-dist');
  const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
    }
    const scanned = pagesNeedingOcr(pages);
    if (scanned.length === 0) return { text: pages.join('\n'), usedOcr: false };

    const base = import.meta.env.BASE_URL + 'tesseract';
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/core`,
      langPath: base,
      gzip: true,
    });
    try {
      const out = [...pages];
      for (const [n, idx] of scanned.entries()) {
        onProgress?.(n + 1, scanned.length);
        const page = await doc.getPage(idx + 1);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        const { data } = await worker.recognize(canvas);
        out[idx] = data.text;
      }
      return { text: out.join('\n'), usedOcr: true };
    } finally {
      await worker.terminate();
    }
  } finally {
    await doc.destroy();
  }
}
