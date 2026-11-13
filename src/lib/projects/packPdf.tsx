import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { headLabel } from './heads';
import { PACK_LABELS } from './packs';
import type { CpdRow, ProjectPack } from '../../types/projectFile';

// Prints project_pack() and project_cpd_halfyearly() as they come — no
// figure here is computed in the browser.
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, paddingBottom: 56, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 8, color: '#5e5d59', textAlign: 'center' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 5 },
  sub: { fontSize: 8, textAlign: 'center', color: '#5e5d59', marginBottom: 10 },
  bar: { fontSize: 9, fontFamily: 'Helvetica-Bold', borderBottom: '0.75pt solid #30302e', paddingBottom: 2, marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 1.5 },
  key: { width: 130, color: '#5e5d59' },
  val: { flex: 1 },
  th: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', backgroundColor: '#f0eee6', padding: '3pt 4pt' },
  tr: { flexDirection: 'row', borderBottom: '0.5pt solid #e8e6dc', padding: '3pt 4pt' },
  c1: { flex: 1 }, cN: { width: 80, textAlign: 'right' }, cS: { width: 50, textAlign: 'right' },
  bad: { color: '#a3341f' },
  signs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 44 },
  sign: { width: '23%', borderTop: '0.5pt solid #30302e', paddingTop: 3, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#87867f' },
});

const inr = (n: number | null | undefined) => `Rs. ${Math.round(Number(n ?? 0)).toLocaleString('en-IN')}`;


function Field({ k, v }: { k: string; v: string | number | null | undefined }) {
  return <View style={styles.row}><Text style={styles.key}>{k}</Text><Text style={styles.val}>{v === null || v === undefined || v === '' ? '—' : String(v)}</Text></View>;
}

export function PackPdf({ pack }: { pack: ProjectPack }) {
  const p = pack.project;
  return (
    <Document title={`${PACK_LABELS[pack.kind]} — ${p.project_no}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>{PACK_LABELS[pack.kind]}</Text>
        <Text style={styles.sub}>{p.project_no} · as on {pack.as_on}</Text>

        <Text style={styles.bar}>Project</Text>
        <Field k="Title" v={p.title} />
        <Field k="Principal Investigator" v={p.pi} />
        <Field k="Track / stage" v={[p.track, p.stage].filter(Boolean).join(' · ')} />
        <Field k="Period" v={`${p.start_date ?? '—'} to ${p.end_date ?? '—'}`} />
        <Field k="Sanction" v={[p.sanction_ref, p.sanction_date].filter(Boolean).join(' dated ')} />
        <Field k="Sanctioned cost" v={inr(pack.totals.sanctioned)} />

        {pack.release && (
          <>
            <Text style={styles.bar}>Demand for {pack.release.fiscal_year}</Text>
            <Field k="Sanctioned for the year" v={inr(pack.release.sanctioned_for_year)} />
            <Field k="Unspent cash in hand" v={inr(pack.release.unspent_cash)} />
            <Field k="Release now requested" v={inr(pack.release.demand)} />
            {pack.release.by_head.map(h => <Field key={h.head} k={`  ${headLabel(h.head)}`} v={inr(h.amount)} />)}
          </>
        )}

        {pack.change && (
          <>
            <Text style={styles.bar}>Change requested</Text>
            <Text>{pack.change.justification || '—'}</Text>
            <Text style={styles.bar}>Checklist B</Text>
            {(pack.checklist_b ?? []).map(c => (
              <View key={c.item} style={styles.row}>
                <Text style={[styles.key, c.ok ? {} : styles.bad]}>{c.ok ? 'Yes' : 'No'}</Text><Text style={styles.val}>{c.detail}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.bar}>Head-wise statement</Text>
        <View style={styles.th}><Text style={styles.c1}>Head</Text><Text style={styles.cN}>Sanctioned</Text><Text style={styles.cN}>Spent</Text><Text style={styles.cN}>Balance</Text></View>
        {pack.heads.map(h => (
          <View key={h.head} style={styles.tr} wrap={false}>
            <Text style={styles.c1}>{headLabel(h.head)}</Text><Text style={styles.cN}>{inr(h.sanctioned)}</Text>
            <Text style={styles.cN}>{inr(h.spent)}</Text><Text style={styles.cN}>{inr(h.balance)}</Text>
          </View>
        ))}

        {pack.labs && (
          <>
            <Text style={styles.bar}>Lab-wise statement</Text>
            <View style={styles.th}><Text style={styles.c1}>Lab</Text><Text style={styles.cN}>Sanctioned</Text><Text style={styles.cN}>Received</Text><Text style={styles.cN}>Spent</Text><Text style={styles.cN}>Balance</Text></View>
            {pack.labs.map(l => (
              <View key={l.lab_code} style={styles.tr} wrap={false}>
                <Text style={styles.c1}>{l.lab_code}{l.role ? ` (${l.role === 'NODAL' ? 'nodal' : 'participating'})` : ''}</Text>
                <Text style={styles.cN}>{inr(l.sanctioned)}</Text><Text style={styles.cN}>{inr(l.received)}</Text>
                <Text style={styles.cN}>{inr(l.spent)}</Text><Text style={styles.cN}>{inr(l.balance)}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.bar}>Year-wise statement</Text>
        <View style={styles.th}><Text style={styles.c1}>Year</Text><Text style={styles.cN}>Sanctioned</Text><Text style={styles.cN}>Received</Text><Text style={styles.cN}>Spent</Text></View>
        {pack.years.map(y => (
          <View key={y.fiscal_year} style={styles.tr} wrap={false}>
            <Text style={styles.c1}>{y.fiscal_year}</Text><Text style={styles.cN}>{inr(y.sanctioned)}</Text>
            <Text style={styles.cN}>{inr(y.received)}</Text><Text style={styles.cN}>{inr(y.spent)}</Text>
          </View>
        ))}
        <View style={styles.tr}>
          <Text style={styles.c1}>Total · unspent cash {inr(pack.totals.unspent_cash)}</Text><Text style={styles.cN}>{inr(pack.totals.sanctioned)}</Text>
          <Text style={styles.cN}>{inr(pack.totals.received)}</Text><Text style={styles.cN}>{inr(pack.totals.spent)}</Text>
        </View>

        <Text style={styles.bar}>Earlier release orders</Text>
        {pack.orders.length === 0 && <Text>None.</Text>}
        {pack.orders.map((o, i) => (
          <Field key={i} k={`${o.received_on} · ${o.fiscal_year}`} v={`${inr(o.amount)} · ${o.order_no || '—'}${o.ifd_file_no ? ` · IFD ${o.ifd_file_no}` : ''}`} />
        ))}

        <View style={styles.signs} wrap={false}>
          {pack.signatories.map(s => <Text key={s.role} style={styles.sign}>{s.name ? `${s.name}\n` : ''}{s.role}</Text>)}
        </View>
        <View style={styles.footer} fixed>
          <Text>From SURYA project file {p.project_id}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Half-yearly performance report to CPD (§5). */
export function CpdReportPdf({ periodEnd, rows }: { periodEnd: string; rows: CpdRow[] }) {
  return (
    <Document title={`CPD half-yearly report — ${periodEnd}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal</Text>
        <Text style={styles.title}>Half-yearly performance report to CPD</Text>
        <Text style={styles.sub}>Half-year ending {periodEnd} · {rows.length} HQ projects</Text>
        <View style={styles.th}>
          <Text style={{ width: 70 }}>Project</Text><Text style={styles.c1}>Title · PI</Text><Text style={styles.cS}>Cat.</Text>
          <Text style={styles.cS}>Reviews due</Text><Text style={styles.cS}>Held</Text><Text style={styles.cS}>Missed</Text>
          <Text style={styles.cN}>Received</Text><Text style={styles.cN}>Spent</Text><Text style={styles.cS}>Milest.</Text><Text style={styles.cS}>Reports</Text>
        </View>
        {rows.map(r => (
          <View key={r.projectId} style={styles.tr} wrap={false}>
            <Text style={{ width: 70 }}>{r.projectNo}</Text><Text style={styles.c1}>{r.title}{r.pi ? ` · ${r.pi}` : ''}</Text>
            <Text style={styles.cS}>{r.category ?? '—'}</Text><Text style={styles.cS}>{r.reviewsDue}</Text><Text style={styles.cS}>{r.reviewsHeld}</Text>
            <Text style={[styles.cS, r.reviewsMissed ? styles.bad : {}]}>{r.reviewsMissed}</Text>
            <Text style={styles.cN}>{inr(r.received)}</Text><Text style={styles.cN}>{inr(r.spent)}</Text>
            <Text style={styles.cS}>{r.milestonesAchieved}/{r.milestonesTotal}</Text><Text style={styles.cS}>{r.reportsSubmitted}</Text>
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>From SURYA project files</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
