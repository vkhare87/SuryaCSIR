import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { DelayRow, TimelineStep } from '../../types/pms';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 8, color: '#5e5d59', textAlign: 'center' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 5 },
  sub: { fontSize: 8, textAlign: 'center', color: '#5e5d59', marginBottom: 10 },
  bar: { fontSize: 9, fontFamily: 'Helvetica-Bold', borderBottom: '0.75pt solid #30302e', paddingBottom: 2, marginTop: 10, marginBottom: 4 },
  th: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', backgroundColor: '#f0eee6', padding: '3pt 4pt' },
  tr: { flexDirection: 'row', borderBottom: '0.5pt solid #e8e6dc', padding: '3pt 4pt' },
  c1: { flex: 1 }, cN: { width: 60, textAlign: 'right' }, cD: { width: 70 },
  sign: { marginTop: 40, textAlign: 'right' },
});

/** Delay report to the DG (PMS Guidelines 2026, Annexure-B): the step counts and every late report. */
export function DelayReportPdf({ cycle, steps, rows }: { cycle: string; steps: TimelineStep[]; rows: DelayRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const label = (n: number) => steps.find(s => s.step === n)?.label ?? `Step ${n}`;
  return (
    <Document title={`PMS delay report — ${cycle}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>PMS {cycle} — delay report to the DG</Text>
        <Text style={styles.sub}>As on {today}</Text>
        <Text style={styles.bar}>Annexure-B steps</Text>
        <View style={styles.th}><Text style={styles.c1}>Step</Text><Text style={styles.cD}>Due</Text><Text style={styles.cN}>Done</Text><Text style={styles.cN}>Pending</Text><Text style={styles.cN}>Overdue</Text></View>
        {steps.map(s => (
          <View key={s.step} style={styles.tr}>
            <Text style={styles.c1}>{s.step}. {s.label}</Text><Text style={styles.cD}>{s.due ?? 'per case'}</Text>
            <Text style={styles.cN}>{s.done}</Text><Text style={styles.cN}>{s.pending}</Text><Text style={styles.cN}>{s.overdue}</Text>
          </View>
        ))}
        <Text style={styles.bar}>Reports past their date</Text>
        {rows.length === 0 && <Text>None.</Text>}
        {rows.map((r, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <Text style={styles.c1}>{r.scientist}</Text><Text style={styles.c1}>{label(r.step)}</Text>
            <Text style={styles.cD}>{r.due}</Text><Text style={styles.cN}>{r.daysLate} days</Text>
          </View>
        ))}
        <Text style={styles.sign}>Director</Text>
      </Page>
    </Document>
  );
}
