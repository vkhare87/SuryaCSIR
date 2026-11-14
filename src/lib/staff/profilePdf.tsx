import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { factYears, groupFacts } from './profile';
import type { ProfileFact, StaffMember } from '../../types';
import type { ExpertMatch } from '../expertise/api';

// Every line below the header comes from staff_profile_facts; the header is
// the staff row (name, designation, division, ORCID).
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 36, paddingBottom: 48, color: '#141413', backgroundColor: '#ffffff' },
  org: { fontSize: 8, color: '#5e5d59' },
  name: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  sub: { fontSize: 9, color: '#5e5d59', marginBottom: 10 },
  bar: { fontSize: 9, fontFamily: 'Helvetica-Bold', borderBottom: '0.75pt solid #30302e', paddingBottom: 2, marginTop: 9, marginBottom: 3 },
  row: { flexDirection: 'row', paddingVertical: 1.5 },
  years: { width: 58, color: '#5e5d59', fontFamily: 'Courier' },
  text: { flex: 1 },
  role: { color: '#5e5d59' },
  more: { color: '#87867f', marginTop: 1 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  count: { width: '25%', paddingVertical: 3 },
  countN: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#87867f' },
});

const today = () => new Date().toISOString().slice(0, 10);

function Header({ member, kind }: { member: StaffMember; kind: string }) {
  return (
    <View>
      <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal · {kind}</Text>
      <Text style={styles.name}>{member.Name}</Text>
      <Text style={styles.sub}>
        {[member.Designation, member.Division, member.orcid ? `ORCID ${member.orcid}` : null].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

function Footer({ member }: { member: StaffMember }) {
  return (
    <View style={styles.footer} fixed>
      <Text>From SURYA records as on {today()} · {member.ID}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Line({ f }: { f: ProfileFact }) {
  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.years}>{factYears(f)}</Text>
      <Text style={styles.text}>{f.title}{f.role ? <Text style={styles.role}> — {f.role}</Text> : null}</Text>
    </View>
  );
}

/** A one-page CV: each section's latest lines, with a count of the rest. */
export function ProfileCv({ member, facts, perSection = 6 }: { member: StaffMember; facts: ProfileFact[]; perSection?: number }) {
  return (
    <Document title={`CV — ${member.Name}`}>
      <Page size="A4" style={styles.page}>
        <Header member={member} kind="Curriculum vitae" />
        {groupFacts(facts).map(s => (
          <View key={s.key}>
            <Text style={styles.bar}>{s.label}</Text>
            {s.facts.slice(0, perSection).map((f, i) => <Line key={`${f.recordType}:${f.recordId}:${i}`} f={f} />)}
            {s.facts.length > perSection && <Text style={styles.more}>and {s.facts.length - perSection} more</Text>}
          </View>
        ))}
        <Footer member={member} />
      </Page>
    </Document>
  );
}

/** For an award or committee nomination: counts first, then the record in full. */
export function NominationBrief({ member, facts }: { member: StaffMember; facts: ProfileFact[] }) {
  const groups = groupFacts(facts).filter(s => s.key !== 'SERVICE' && s.key !== 'AWP');
  return (
    <Document title={`Nomination brief — ${member.Name}`}>
      <Page size="A4" style={styles.page}>
        <Header member={member} kind="Nomination brief" />
        <View style={styles.counts}>
          {groups.map(s => (
            <View key={s.key} style={styles.count}>
              <Text style={styles.countN}>{s.facts.length}</Text>
              <Text style={styles.role}>{s.label}</Text>
            </View>
          ))}
        </View>
        {groups.map(s => (
          <View key={s.key}>
            <Text style={styles.bar}>{s.label}</Text>
            {s.facts.map((f, i) => <Line key={`${f.recordType}:${f.recordId}:${i}`} f={f} />)}
          </View>
        ))}
        <Footer member={member} />
      </Page>
    </Document>
  );
}

/** "Who can do X?" — the ranked people with their proof, load and retirement (expertise_find). */
export function ExpertShortlist({ query, rows }: { query: string; rows: ExpertMatch[] }) {
  return (
    <Document title={`Expertise shortlist — ${query}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.org}>CSIR-Advanced Materials and Processes Research Institute, Bhopal · Expertise shortlist</Text>
        <Text style={styles.name}>{query}</Text>
        <Text style={styles.sub}>Ranked by confirmed expertise, then by records that mention it.</Text>
        {rows.map((r, i) => (
          <View key={r.staff_id} wrap={false}>
            <Text style={styles.bar}>{i + 1}. {r.name}{r.designation ? ` · ${r.designation}` : ''}{r.division ? ` · ${r.division}` : ''}</Text>
            <Text style={styles.role}>
              {r.confirmed_terms ? 'Confirmed · ' : ''}{r.evidence_count} record(s) · {r.active_projects} running project(s){r.overload ? ' · overloaded' : ''}
              {r.retires_on ? ` · retires ${r.retires_on}` : ''}
            </Text>
            {r.evidence.slice(0, 5).map((e, j) => (
              <View key={`${e.type}:${e.id}:${j}`} style={styles.row}>
                <Text style={styles.years}>{e.type}</Text>
                <Text style={styles.text}>{e.title}</Text>
              </View>
            ))}
            {r.evidence.length > 5 && <Text style={styles.more}>and {r.evidence.length - 5} more</Text>}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>From SURYA records as on {today()} · expertise_find</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
