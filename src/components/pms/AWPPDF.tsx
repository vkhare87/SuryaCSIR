import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  AWP_DEVELOPMENT_LABELS, AWP_OBJECTIVE_LABELS, AWP_PROJECT_LABELS, activityTotal,
} from '../../lib/pms/awp';
import type { AWPPartA, PMSAWP } from '../../types/pms';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#141413', backgroundColor: '#ffffff' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 2 },
  subtitle: { fontSize: 9, textAlign: 'center', color: '#5e5d59', marginBottom: 12 },
  bar: { backgroundColor: '#30302e', color: '#ffffff', fontFamily: 'Helvetica-Bold', padding: '3pt 6pt', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #e8e6dc', paddingVertical: 3 },
  key: { width: 150, color: '#5e5d59' },
  val: { flex: 1 },
  th: { fontFamily: 'Helvetica-Bold', backgroundColor: '#f0eee6' },
  cellLabel: { width: 140, paddingRight: 6 },
  cellRole: { flex: 1, paddingRight: 6 },
  cellPct: { width: 40, textAlign: 'right' },
  para: { lineHeight: 1.35, marginBottom: 4 },
  small: { fontSize: 8, color: '#5e5d59' },
  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7, color: '#87867f', textAlign: 'center' },
});

const PART_A: [keyof AWPPartA, string][] = [
  ['name', 'Name of Employee'], ['employeeId', 'Employee ID'], ['group', 'Group / Grade'],
  ['dob', 'Date of Birth'], ['designation', 'Current Designation'], ['division', 'Division / Department'],
  ['dojCsir', 'Date of Joining CSIR'], ['dojGrade', 'Date of Joining Present Grade'],
  ['category', 'Category'], ['email', 'Email ID'], ['mobile', 'Mobile No.'],
  ['reportingOfficer', 'Reporting Officer'], ['reviewingOfficer', 'Reviewing Officer'],
];

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');

function Field({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.val}>{v || '-'}</Text>
    </View>
  );
}

export function AWPPDF({ awp }: { awp: PMSAWP }) {
  const [from] = awp.reportingYear.split('-');
  const a = awp.partA;
  const prev = a.prevPmsOnTime == null ? '-' : a.prevPmsOnTime ? `Yes${a.prevPmsDate ? `, on ${a.prevPmsDate}` : ''}` : 'No';

  return (
    <Document title={`AWP ${awp.reportingYear} - ${a.name || awp.staffId}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PART V - ANNUAL WORK PLAN (AWP)</Text>
        <Text style={styles.subtitle}>
          CSIR Performance Mapping of Scientists (PMS) Guidelines, 2026 · Reporting Period: 1 April {from} - 31 March {Number(from) + 1}
        </Text>

        <Text style={styles.bar}>PART A - PERSONAL DETAILS</Text>
        {PART_A.map(([k, label]) => <Field key={k} k={label} v={String(a[k] ?? '')} />)}
        <Field k="Previous year's PMS submitted on time?" v={prev} />

        <Text style={styles.bar}>PART B - PROPOSED PLAN / PERFORMANCE INDICATORS</Text>
        <View style={[styles.row, styles.th]}>
          <Text style={styles.cellLabel}>Nature of Activity</Text>
          <Text style={styles.cellRole}>Role</Text>
          <Text style={styles.cellPct}>Time (%)</Text>
        </View>
        {awp.activitySplit.map((r, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.cellLabel}>{r.label}</Text>
            <Text style={styles.cellRole}>{r.role}</Text>
            <Text style={styles.cellPct}>{r.timePct}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text style={styles.cellLabel}>Total</Text>
          <Text style={styles.cellRole} />
          <Text style={styles.cellPct}>{activityTotal(awp.activitySplit)}</Text>
        </View>

        <Text style={styles.bar}>1. RESEARCH PROJECTS FOR THE REPORTING YEAR</Text>
        {awp.projects.map(p => (
          <View key={p.kind} style={{ marginBottom: 6 }} wrap={false}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{AWP_PROJECT_LABELS[p.kind]}{p.confidential ? ' (confidential)' : ''}</Text>
            {p.details ? <Text style={styles.para}>{p.details}</Text> : null}
            {p.objectives ? <Text style={styles.para}>{p.objectives}</Text> : null}
            {p.resources ? <Text style={[styles.para, styles.small]}>Resources: {p.resources}</Text> : null}
          </View>
        ))}

        <Text style={styles.bar}>2. RESEARCH OBJECTIVES AND PLANNED ACTIVITIES</Text>
        {AWP_OBJECTIVE_LABELS.map(([k, label]) => (
          <View key={k} style={{ marginBottom: 4 }}>
            <Text style={styles.small}>{label}</Text>
            <Text style={styles.para}>{awp.objectives[k] || '-'}</Text>
          </View>
        ))}

        <Text style={styles.bar}>3. PROFESSIONAL & PERSONAL DEVELOPMENT</Text>
        {AWP_DEVELOPMENT_LABELS.map(([k, label]) => (
          <View key={k} style={{ marginBottom: 4 }}>
            <Text style={styles.small}>{label}</Text>
            <Text style={styles.para}>{awp.development[k] || '-'}</Text>
          </View>
        ))}

        <Text style={styles.bar}>4. ANY OTHER INSTITUTIONAL WORK IN THE REPORTING YEAR</Text>
        <Text style={styles.para}>{awp.institutionalWork || '-'}</Text>
        <Text style={styles.bar}>5. ANY OTHER MATTER</Text>
        <Text style={styles.para}>{awp.other || '-'}</Text>

        <View style={styles.sign} wrap={false}>
          <Text>Submitted: {date(awp.submittedAt)}</Text>
          <Text>Signature of the Scientist</Text>
        </View>

        <View wrap={false}>
          <Text style={styles.bar}>REVIEW & ENDORSEMENT</Text>
          <Text style={styles.para}>
            Head of Division / Reporting Officer: {awp.roVerdict === 'REASONABLE' ? 'Appears reasonable'
              : awp.roVerdict === 'NOT_REASONABLE' ? 'Does not appear reasonable' : 'Pending'}
            {awp.roAt ? ` (${date(awp.roAt)})` : ''}
          </Text>
          {awp.roVerdict === 'NOT_REASONABLE' && awp.roReasons ? <Text style={styles.para}>Reasons: {awp.roReasons}</Text> : null}
          {awp.rvoAt ? <Text style={styles.para}>Reviewing Officer ({date(awp.rvoAt)}): {awp.rvoRemarks || 'Forwarded'}</Text> : null}
          <Text style={styles.para}>
            Director: {awp.directorDecision === 'ACCEPTED' ? 'Approved' : awp.directorDecision === 'MODIFIED' ? 'Approved with modifications' : 'Pending'}
            {awp.approvedAt ? ` (${date(awp.approvedAt)})` : ''}
          </Text>
          {awp.directorRemarks ? <Text style={styles.para}>Remarks: {awp.directorRemarks}</Text> : null}
        </View>

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `CSIR PMS Guidelines 2026 - Part V: Annual Work Plan · Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
