import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useClaim, useHome } from '../../contexts/HomeContext';
import { useRules } from '../../contexts/RulesContext';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import {
  AskBox, BLOCK_TITLE, HomeGreeting, NotConnected, ROW, WaitingOnYou,
} from '../../components/home/parts';
import { countWord } from '../../lib/home/greeting';
import { deskKey } from '../../lib/home/desk';
import { localIso } from '../../lib/home/today';
import {
  contractClock, currentEngagement, leaveYear, myProjectStaffRecord, paidLeaveUsed, yearsMonths,
} from '../../lib/home/people';
import type { MyProjectStaffRecord } from '../../lib/home/people';
import { ruleNumber } from '../../lib/rules/csirRules';

const LETTERS = ['Experience certificate', 'Pay certificate', 'No-objection letter', 'ID card'];

function partOfDay(h: number) { return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function Clock({ label, share, children }: { label: string; share: number | null; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-hover p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden mt-2" aria-hidden="true">
        {share !== null && <div className="h-full rounded-full bg-text-muted" style={{ width: `${Math.round(share * 100)}%` }} />}
      </div>
      <p className="text-xs text-text-muted mt-2">{children}</p>
    </div>
  );
}

export function ProjectStaffView() {
  const { projects } = useData();
  const { ownStaff, actions, doneCount } = useHome();
  const { rules } = useRules();
  const now = useMemo(() => new Date(), []);
  const today = localIso(now);

  // undefined = still loading; null = this login is not linked to a project staff record.
  const [record, setRecord] = useState<MyProjectStaffRecord | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    myProjectStaffRecord(today).then((r) => { if (!cancelled) setRecord(r); });
    return () => { cancelled = true; };
  }, [today]);

  useClaim(useMemo(() => actions.slice(0, 5).map(a => deskKey.action(a.id)), [actions]));

  const engagement = record ? currentEngagement(record.engagements, today) : null;
  const project = engagement ? projects.find(p => p.ProjectID === engagement.projectId) ?? null : null;
  const clock = engagement ? contractClock(engagement, now) : null;
  const capYears = ruleNumber(rules, 'project_staff.tenure_cap_years', today);
  const capDays = capYears === null ? null : Math.round(capYears * 365.25);
  const leaveDays = ruleNumber(rules, 'project_staff.paid_leave_days_per_year', today);
  const leaveUsed = record ? paidLeaveUsed(record.leave, today) : 0;
  const yr = leaveYear(today);

  const hello = `${partOfDay(now.getHours())}${ownStaff ? `, ${ownStaff.Name}` : ''}.`;
  const sentence = record === undefined
    ? hello
    : !engagement || !clock
      ? `${hello} Your project staff record is not linked to this account yet.`
      : clock.daysLeft < 0
        ? `${hello} Your engagement ended on ${engagement.toOn}.`
        : `${hello} Your contract${project ? ` on ${project.ProjectNo}` : ''} runs to ${engagement.toOn}. ${
          countWord(clock.daysLeft)} ${clock.daysLeft === 1 ? 'day is' : 'days are'} left.`;

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Greeting and two clocks --- */}
      <HomeGreeting
        done={doneCount} total={actions.length + doneCount} sentence={sentence}
        sub={engagement
          ? <>Position <span className="font-mono">{engagement.positionCode}</span>{project ? ` · ${project.ProjectName}` : ''}</>
          : record === null ? 'PME or HR links your login to your record.' : ' '}
      />
      {engagement && clock && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Clock label="This contract" share={clock.share}>
            <span className="font-mono">{Math.max(0, clock.daysLeft)}</span> days left · <span className="font-mono">{engagement.fromOn}</span> to <span className="font-mono">{engagement.toOn}</span>
          </Clock>
          <Clock label={capYears === null ? 'Time in CSIR projects' : `Time in CSIR projects · limit ${capYears} years`}
            share={record?.tenureDays != null && capDays ? Math.min(1, record.tenureDays / capDays) : null}>
            {record?.tenureDays == null
              ? 'Not available.'
              : <><span className="font-mono">{yearsMonths(record.tenureDays)}</span> used
                {capDays ? <> · <span className="font-mono">{yearsMonths(Math.max(0, capDays - record.tenureDays))}</span> left</> : ' · limit not on record'}</>}
          </Clock>
        </div>
      )}

      {/* --- 2. Ask --- */}
      <AskBox placeholder="Ask SURYA: how many days of leave do I get?" />

      {/* --- 3. What waits on me --- */}
      <WaitingOnYou actions={actions} now={now} rows={4} />

      {/* --- 4. Leave and letters --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className={BLOCK_TITLE}>
            <span>My leave · since <span className="font-mono">{yr.from}</span></span>
            {leaveDays !== null && record && <span className="font-mono">{Math.max(0, leaveDays - leaveUsed)} of {leaveDays} left</span>}
          </p>
          {!record
            ? <p className="text-sm text-text-muted">Your leave shows here once your record is linked.</p>
            : <>
              <div className={ROW}>
                <p className="flex-1 text-sm text-text">Paid leave taken</p>
                <span className="font-mono text-xs text-text-muted">{leaveUsed} d</span>
              </div>
              {record.leave.slice(-3).reverse().map(l => (
                <div key={`${l.kind}-${l.fromOn}`} className={ROW}>
                  <p className="flex-1 text-xs text-text-muted">{l.kind.toLowerCase()}</p>
                  <span className="font-mono text-xs text-text-muted">{l.fromOn} to {l.toOn}</span>
                </div>
              ))}
              <p className="text-xs text-text-muted mt-2">Ask for leave through your project leader. A request form comes later.</p>
            </>}
        </Card>
        <Card className="p-5">
          <p className={BLOCK_TITLE}><span>Papers I can ask for</span></p>
          <div className="flex flex-wrap gap-2">
            {LETTERS.map(l => <Link key={l} to="/helpdesk/new"><Button variant="secondary" size="sm" type="button">{l}</Button></Link>)}
          </div>
          <p className="text-xs text-text-muted mt-3">Each opens a request to the office today. One-click letters from your record come later.</p>
        </Card>
      </div>

      {/* --- 5. Blocks that wait on other work --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NotConnected title="My pay">Your last pay and any pay-raise request will show here when Accounts' files are linked.</NotConnected>
        <NotConnected title="What next for me">Open posts that fit you under the rules will show here.</NotConnected>
      </div>
    </div>
  );
}
