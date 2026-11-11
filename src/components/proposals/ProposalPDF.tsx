import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { headLabel } from '../../lib/projects/heads';
import { HQ_CATEGORIES } from '../../lib/proposals/categories';
import type { Proposal } from '../../types/proposal';

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
  cYear: { width: 60 }, cHead: { width: 110 }, cItem: { flex: 1 }, cAmt: { width: 90, textAlign: 'right' },
  signs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 },
  sign: { width: '30%', borderTop: '0.5pt solid #30302e', paddingTop: 4, fontSize: 9, textAlign: 'center' },
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

function Prose({ label, text }: { label: string; text: string }) {
  return (
    <View wrap>
      <Text style={styles.bar}>{label}</Text>
      <Text style={styles.para}>{text || '—'}</Text>
    </View>
  );
}

interface ProposalPDFProps {
  proposal: Proposal;
  /** The version this printout is, so the signed scan can be matched to it. */
  versionNo: number;
  printedAt: Date;
}

/** The proposal as printed for signature. Signatures go on paper; the scan is uploaded. */
export function ProposalPDF({ proposal: p, versionNo, printedAt }: ProposalPDFProps) {
  const lines = p.budgetLines ?? [];
  const category = p.track === 'HQ'
    ? HQ_CATEGORIES.find(c => c.code === p.categoryCode)?.name ?? p.categoryCode
    : p.projectCategory;
  const total = lines.reduce((s, l) => s + l.amount, 0) || p.requestedBudget;

  return (
    <Document title={`${p.proposalCode} ${p.title}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>{p.title}</Text>
        <Text style={styles.subtitle}>
          Project proposal {p.proposalCode}{p.acronym ? ` · ${p.acronym}` : ''} · {p.track === 'HQ' ? 'CSIR HQ scheme' : 'In-house (ULIP)'}
        </Text>

        <Text style={styles.bar}>Particulars</Text>
        <Field label="Principal investigator" value={p.piName} />
        <Field label="Co-investigators" value={(p.coPIs ?? []).map(c => c.staffName).join(', ')} />
        <Field label="Division" value={p.divisionCode} />
        <Field label="Theme" value={p.domainTheme} />
        <Field label="Category" value={category} />
        <Field label="Proposed start" value={p.proposedStartDate} />
        <Field label="Duration" value={p.proposedDurationMonths ? `${p.proposedDurationMonths} months` : ''} />
        <Field label="Readiness level (TRL)" value={`${p.currentTrl ?? '—'} now, ${p.targetTrl ?? '—'} aimed for`} />
        <Field label="Funding" value={[p.fundType, p.sponsorType, p.sponsorName].filter(Boolean).join(' · ')} />
        <Field label="Total requested" value={inr(total)} />

        <Prose label="Abstract" text={p.abstract} />
        <Prose label="Problem statement" text={p.problemStatement} />
        <Prose label="Objectives" text={p.objectives} />
        <Prose label="Expected outcomes" text={p.expectedOutcomes} />

        {lines.length > 0 && (
          <View wrap={false}>
            <Text style={styles.bar}>Budget, year and head-wise</Text>
            <View style={styles.th}>
              <Text style={styles.cYear}>Year</Text><Text style={styles.cHead}>Head</Text>
              <Text style={styles.cItem}>Item</Text><Text style={styles.cAmt}>Amount</Text>
            </View>
            {lines.map(l => (
              <View key={l.id} style={styles.tr}>
                <Text style={styles.cYear}>{l.fiscalYear}</Text><Text style={styles.cHead}>{headLabel(l.head)}</Text>
                <Text style={styles.cItem}>{l.item}</Text><Text style={styles.cAmt}>{inr(l.amount)}</Text>
              </View>
            ))}
            <View style={[styles.tr, { fontFamily: 'Helvetica-Bold' }]}>
              <Text style={styles.cYear} /><Text style={styles.cHead} /><Text style={styles.cItem}>Total</Text>
              <Text style={styles.cAmt}>{inr(total)}</Text>
            </View>
          </View>
        )}

        <View style={styles.signs} wrap={false}>
          <Text style={styles.sign}>Principal investigator</Text>
          <Text style={styles.sign}>Head of division</Text>
          <Text style={styles.sign}>Head, PME</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>{p.proposalCode} · version {versionNo}</Text>
          <Text>Printed {printedAt.toLocaleDateString('en-IN')}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
