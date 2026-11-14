import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatMetric, type packRows } from '../metrics/api';

// Research Council / annual-report numbers "as on" one date. Every figure is
// the frozen snapshot for that date (metric_snapshots), so the pack prints the
// same today and next year.
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, padding: 32, paddingBottom: 44, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 8, color: '#5e5d59' },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  sub: { fontSize: 8.5, color: '#5e5d59', marginBottom: 10 },
  head: { flexDirection: 'row', borderBottom: '0.75pt solid #30302e', paddingBottom: 3, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottom: '0.25pt solid #d1cfc5', paddingVertical: 2.5 },
  label: { flex: 3 },
  cell: { flex: 1, textAlign: 'right' },
  note: { fontSize: 7, color: '#87867f', marginTop: 10 },
  footer: { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#87867f' },
});

export function MetricsPack({ asOn, divisions, rows }: { asOn: string; divisions: string[]; rows: ReturnType<typeof packRows> }) {
  return (
    <Document title={`Institute numbers as on ${asOn}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>Institute numbers as on {asOn}</Text>
        <Text style={styles.sub}>For the Research Council and the annual report. Frozen snapshot; each number is defined in the metric registry.</Text>
        <View style={styles.head}>
          <Text style={styles.label}>Metric</Text>
          <Text style={styles.cell}>Institute</Text>
          {divisions.map(d => <Text key={d} style={styles.cell}>{d}</Text>)}
        </View>
        {rows.map(r => (
          <View key={r.metric.key} style={styles.row} wrap={false}>
            <Text style={styles.label}>{r.metric.label}</Text>
            <Text style={styles.cell}>{formatMetric(r.institute, r.metric.unit)}</Text>
            {r.byDivision.map((v, i) => <Text key={divisions[i]} style={styles.cell}>{formatMetric(v, r.metric.unit)}</Text>)}
          </View>
        ))}
        <Text style={styles.note}>{rows.map(r => `${r.metric.label}: ${r.metric.definition}.`).join(' ')}</Text>
        <View style={styles.footer} fixed>
          <Text>From SURYA metric_snapshots as on {asOn}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
