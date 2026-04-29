import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PMSReport, PMSReportSection, PMSAnnexure } from '../../types/pms';
import { SCORE_CATEGORIES } from '../../lib/pms/constants';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 40, color: '#141413', backgroundColor: '#ffffff' },
  header: { marginBottom: 20, borderBottom: '1pt solid #c96442', paddingBottom: 10 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#c96442', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#6b6b6a' },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 4, color: '#30302e', borderBottom: '0.5pt solid #e8e6dc', paddingBottom: 2 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 120, color: '#6b6b6a', fontSize: 9 },
  value: { flex: 1, color: '#141413' },
  tableRow: { flexDirection: 'row', padding: '3pt 6pt', borderBottom: '0.5pt solid #f0eee6' },
  tableCell: { flex: 1, fontSize: 9 },
  scoreBox: { padding: '8pt 12pt', backgroundColor: '#fdf0e8', border: '1pt solid #c96442', borderRadius: 4, marginBottom: 8 },
  scoreText: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#c96442' },
  scoreLabel: { fontSize: 9, color: '#b5593b', marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '0.5pt solid #e8e6dc', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9b9b9a' },
});

function getCategory(score: number): string {
  return SCORE_CATEGORIES.find(c => score >= c.min && score <= c.max)?.label ?? '—';
}

function SectionBlock({ section }: { section: PMSReportSection }) {
  const data = section.data;
  const items = (data.items as Record<string, string>[] | undefined) ?? [];
  const text = data.text as string | undefined;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.sectionKey.replace(/_/g, ' ').toUpperCase()}</Text>
      {text && <Text style={{ fontSize: 9, color: '#141413', lineHeight: 1.4 }}>{text}</Text>}
      {items.length > 0 && (
        <View>
          {items.slice(0, 10).map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, width: 20, color: '#9b9b9a' }}>{i + 1}.</Text>
              {Object.values(item).map((v, j) => (
                <Text key={j} style={styles.tableCell}>{String(v)}</Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

interface ReportPDFProps {
  report: PMSReport;
  sections: PMSReportSection[];
  annexures: PMSAnnexure[];
  finalScore?: number | null;
  justification?: string | null;
  recommendedMin?: number | null;
  recommendedMax?: number | null;
}

export function ReportPDF({
  report, sections, annexures,
  finalScore, justification, recommendedMin, recommendedMax,
}: ReportPDFProps) {
  return (
    <Document title={`PMS Report — ${report.id}`} author="CSIR-AMPRI SURYA Platform">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Performance Appraisal Report</Text>
          <Text style={styles.subtitle}>CSIR-AMPRI · {report.cycle?.name ?? 'Appraisal Cycle'}</Text>
          <Text style={styles.subtitle}>Generated: {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report Details</Text>
          <View style={styles.row}><Text style={styles.label}>Scientist ID:</Text><Text style={styles.value}>{report.scientistId}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Period:</Text><Text style={styles.value}>{report.periodFrom ?? '—'} to {report.periodTo ?? '—'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Submitted:</Text><Text style={styles.value}>{report.submittedAt ? new Date(report.submittedAt).toLocaleDateString('en-IN') : '—'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Status:</Text><Text style={styles.value}>{report.status}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Self Score:</Text><Text style={styles.value}>{report.selfScore != null ? `${report.selfScore} (${getCategory(report.selfScore)})` : '—'}</Text></View>
        </View>

        {(finalScore != null || recommendedMin != null) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score Summary</Text>
            {recommendedMin != null && (
              <View style={styles.row}>
                <Text style={styles.label}>Chairman Range:</Text>
                <Text style={styles.value}>{recommendedMin} – {recommendedMax}</Text>
              </View>
            )}
            {finalScore != null && (
              <View style={styles.scoreBox}>
                <Text style={styles.scoreText}>Final Score: {finalScore}</Text>
                <Text style={styles.scoreLabel}>{getCategory(finalScore)}</Text>
                {justification && <Text style={{ fontSize: 8, color: '#6b6b6a', marginTop: 4 }}>{justification}</Text>}
              </View>
            )}
          </View>
        )}

        {sections.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Report Sections</Text>
            {sections.map(s => <SectionBlock key={s.id} section={s} />)}
          </View>
        )}

        {annexures.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Annexures</Text>
            {annexures.map((a, i) => (
              <View key={a.id} style={styles.row}>
                <Text style={styles.label}>{i + 1}.</Text>
                <Text style={styles.value}>{a.fileName} ({Math.round(a.fileSize / 1024)} KB)</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>CSIR-AMPRI SURYA Platform — Confidential</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
