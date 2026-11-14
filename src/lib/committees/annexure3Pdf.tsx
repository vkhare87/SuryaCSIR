import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface Annexure3Row {
  name: string;
  format: 'F1' | 'F2';
  note: string | null;
  decision: 'CONTINUE' | 'RECUSE' | null;
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 40, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 9, color: '#5e5d59', textAlign: 'center' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6 },
  sub: { fontSize: 9, textAlign: 'center', color: '#5e5d59', marginBottom: 14 },
  th: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', backgroundColor: '#f0eee6', padding: '4pt' },
  tr: { flexDirection: 'row', borderBottom: '0.5pt solid #e8e6dc', padding: '4pt' },
  cNo: { width: 24 }, cName: { width: 140 }, cNote: { flex: 1 }, cDec: { width: 90 },
  none: { marginTop: 8, color: '#5e5d59' },
  sign: { marginTop: 48, flexDirection: 'row', justifyContent: 'flex-end' },
});

const decisionText = (d: Annexure3Row['decision']) => d === 'RECUSE' ? 'Recused' : d === 'CONTINUE' ? 'Continues' : 'Not yet decided';

/** Annexure 3 (§6.3): members who declared a conflict (Format 2) or were recused, for one meeting. */
export function Annexure3Pdf({ committee, meeting, date, rows }: { committee: string; meeting: string; date: string; rows: Annexure3Row[] }) {
  const listed = rows.filter(r => r.format === 'F2' || r.decision === 'RECUSE');
  return (
    <Document title={`Annexure 3 — ${meeting}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>Annexure 3 — Declarations of conflict of interest</Text>
        <Text style={styles.sub}>{committee} · {meeting} · {date}</Text>
        <View style={styles.th}>
          <Text style={styles.cNo}>#</Text><Text style={styles.cName}>Member</Text>
          <Text style={styles.cNote}>Conflict declared (Format 2)</Text><Text style={styles.cDec}>Chair's decision</Text>
        </View>
        {listed.map((r, i) => (
          <View key={r.name + i} style={styles.tr} wrap={false}>
            <Text style={styles.cNo}>{i + 1}</Text><Text style={styles.cName}>{r.name}</Text>
            <Text style={styles.cNote}>{r.note ?? '—'}</Text><Text style={styles.cDec}>{decisionText(r.decision)}</Text>
          </View>
        ))}
        {listed.length === 0 && <Text style={styles.none}>No member declared a conflict of interest.</Text>}
        <View style={styles.sign}><Text>Chairperson</Text></View>
      </Page>
    </Document>
  );
}
