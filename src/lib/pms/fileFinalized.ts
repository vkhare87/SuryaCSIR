import { createElement } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { registerDocument } from '../documents/registry';
import { logger } from '../../utils/logger';
import type { PMSReport, PMSReportSection, PMSAnnexure } from '../../types/pms';

interface FileFinalizedInput {
  report: PMSReport;
  sections: PMSReportSection[];
  annexures: PMSAnnexure[];
  finalScore: number | null;
  justification: string | null;
}

/**
 * Render the finalized PMS report to PDF and file it in the annexures bucket +
 * documents registry (confidential tier) so the RAG layer can index it.
 * Non-fatal: a failure here must not block finalization. @react-pdf and the
 * PDF component are dynamically imported to stay out of the context bundle.
 */
export async function fileFinalizedReport(input: FileFinalizedInput): Promise<void> {
  if (!supabase) return;
  try {
    const [{ pdf }, { ReportPDF }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../../components/pms/ReportPDF'),
    ]);

    // @react-pdf's pdf() expects a Document element; ReportPDF wraps one. Cast bridges
    // the wrapper's element type to the renderer's expected ReactElement<DocumentProps>.
    const doc = createElement(ReportPDF, {
      report: input.report,
      sections: input.sections,
      annexures: input.annexures,
      finalScore: input.finalScore,
      justification: input.justification,
    }) as unknown as Parameters<typeof pdf>[0];

    const blob = await pdf(doc).toBlob();

    const path = `${input.report.id}/finalized_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from('annexures').upload(path, blob, {
      contentType: 'application/pdf', upsert: true,
    });
    if (upErr) { logger.error('[pms] finalized upload failed', upErr); return; }

    await registerDocument({
      entityType: 'pms_report',
      entityId: input.report.id,
      docType: 'finalized_report',
      title: `Finalized PMS Report — ${input.report.cycle?.name ?? input.report.id}`,
      storageBucket: 'annexures',
      storagePath: path,
      fileName: `finalized_${input.report.id}.pdf`,
      fileSize: blob.size,
      mimeType: 'application/pdf',
      accessTier: 'confidential',
    });
  } catch (e) {
    logger.error('[pms] fileFinalizedReport failed', e);
  }
}
