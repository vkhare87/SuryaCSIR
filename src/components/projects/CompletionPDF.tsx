import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { COMPLETION_FIELDS, OBJECTIVES_LABELS } from '../../lib/projects/closure';
import { headLabel } from '../../lib/projects/heads';
import type { ProjectInfo } from '../../types';
import type { CompletionReport } from '../../types/projectFile';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 40, paddingBottom: 60, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 9, color: '#5e5d59', textAlign: 'center' },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6, marginBottom: 2 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#5e5d59', marginBottom: 14 },
  bar: { fontSize: 10, fontFamily: 'Helvetica-Bold', borderBottom: '0.75pt solid #30302e', paddingBottom: 2, marginTop: 12, marginBottom: 5 },
  row: { flexDirection: 'row', paddingVertical: 2 },
  key: { width: 150, color: '#5e5d59' },
  val: { flex: 1 },
  para: { lineHeight: 1.4 },
  th: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', backgroundColor: '#f0eee6', padding: '3pt 4pt' },
  tr: { flexDirection: 'row', borderBottom: '0.5pt solid #e8e6dc', padding: '3pt 4pt' },
  cYear: { width: 70 }, cHead: { flex: 1 }, cAmt: { width: 100, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#87867f' },
});

const inr = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-IN')}`;

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{label}</Text>
      <Text style={styles.val}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text>
    </View>
  );
}

/**
 * The approved completion report as published to the institute archive. The
 * lessons are plain prose so the RAG worker indexes them and Ask SURYA can
 * cite them by page.
 */
export function CompletionPDF({ project, report }: { project: ProjectInfo; report: CompletionReport }) {
  const fs = report.financialStatement;
  return (
    <Document title={`Completion report — ${project.ProjectNo}`} author="CSIR-AMPRI" subject={project.ProjectName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR — Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>Project Completion Report</Text>
        <Text style={styles.subtitle}>{project.ProjectNo} · {project.ProjectName}</Text>

        <Field label="Principal Investigator" value={project.PrincipalInvestigator} />
        <Field label="Division" value={project.DivisionCode} />
        <Field label="Scheme" value={project.track === 'ULIP' ? 'In-house (ULIP)' : project.track === 'HQ' ? 'CSIR HQ scheme' : project.track} />
        <Field label="Period" value={`${project.StartDate || '—'} to ${project.CompletioDate || '—'}`} />
        <Field label="Objectives" value={report.objectives_status ? OBJECTIVES_LABELS[report.objectives_status] : null} />
        <Field label="Readiness level" value={report.trl_reached ? `TRL ${report.trl_reached}${report.trl_target ? ` (target ${report.trl_target})` : ''}` : null} />
        <Field label="Approved" value={report.decidedAt?.slice(0, 10)} />

        {COMPLETION_FIELDS.filter(f => report[f.key].trim()).map(f => (
          <View key={f.key} wrap>
            <Text style={styles.bar}>{f.label}</Text>
            <Text style={styles.para}>{report[f.key]}</Text>
          </View>
        ))}

        {fs && (
          <View wrap>
            <Text style={styles.bar}>Financial statement — allocation against expenditure</Text>
            <View style={styles.th}><Text style={styles.cYear}>Year</Text><Text style={styles.cHead}>Head</Text><Text style={styles.cAmt}>Sanctioned</Text><Text style={styles.cAmt}>Spent</Text></View>
            {fs.heads.map(h => (
              <View key={`${h.fiscal_year}${h.head}`} style={styles.tr} wrap={false}>
                <Text style={styles.cYear}>{h.fiscal_year}</Text><Text style={styles.cHead}>{headLabel(h.head)}</Text>
                <Text style={styles.cAmt}>{inr(h.sanctioned)}</Text><Text style={styles.cAmt}>{inr(h.spent)}</Text>
              </View>
            ))}
            <Field label="Total sanctioned" value={inr(fs.sanctioned)} />
            <Field label="Total received" value={inr(fs.received_total)} />
            <Field label="Total spent" value={inr(fs.spent_total)} />
          </View>
        )}

        {report.annexures.length > 0 && (
          <View wrap>
            <Text style={styles.bar}>Annexures</Text>
            {report.annexures.map((a, i) => (
              <Text key={i} style={styles.para}>{i + 1}. {a.label}{a.date ? ` (${a.date})` : ''}{a.missing ? ' — not on file' : ''}</Text>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>SURYA · {project.ProjectNo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
