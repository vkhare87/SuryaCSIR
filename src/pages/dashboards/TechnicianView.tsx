import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useClaim, useHome } from '../../contexts/HomeContext';
import { Card, Badge } from '../../components/ui/Cards';
import {
  AskBox, BLOCK_TITLE, HomeGreeting, NotConnected, ROW, TITLE_LINK, WaitingOnYou,
} from '../../components/home/parts';
import { countWord } from '../../lib/home/greeting';
import { deskKey } from '../../lib/home/desk';
import { daysUntil } from '../../lib/home/today';
import { isEquipmentDown } from '../../utils/equipmentStatus';
import { parseDate, staffNameMatchesAuthor } from '../../utils/dateUtils';
import type { Equipment } from '../../types';

const AMC_HORIZON_DAYS = 60;

function partOfDay(h: number) { return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function amcDays(e: Equipment, now: Date): number | null {
  const d = parseDate(e.amc_end_date);
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return daysUntil(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, now);
}

export function TechnicianView() {
  const { user, divisionCode } = useAuth();
  const { equipment } = useData();
  const { ownStaff, actions, doneCount } = useHome();
  const now = useMemo(() => new Date(), []);

  // ponytail: "mine" = in my charge (owner) or named as operator, until the in-charge register (TS1/TS2) lands.
  const mine = useMemo(() => equipment.filter(e =>
    (user && e.owner_user_id === user.id)
    || (ownStaff && e.OperatorName && staffNameMatchesAuthor(ownStaff.Name, e.OperatorName))),
  [equipment, user, ownStaff]);
  const down = useMemo(() => mine.filter(e => isEquipmentDown(e.WorkingStatus)), [mine]);
  const divisionDown = useMemo(
    () => (mine.length > 0 ? [] : equipment.filter(e => (!divisionCode || e.Division === divisionCode) && isEquipmentDown(e.WorkingStatus))),
    [mine, equipment, divisionCode],
  );

  useClaim(useMemo(() => actions.slice(0, 5).map(a => deskKey.action(a.id)), [actions]));

  const hello = `${partOfDay(now.getHours())}${ownStaff ? `, ${ownStaff.Name}` : ''}.`;
  const sentence = mine.length === 0
    ? `${hello} No instrument is recorded in your charge yet.`
    : `${hello} ${countWord(mine.length)} ${mine.length === 1 ? 'instrument is' : 'instruments are'} yours. ${
      down.length === 0 ? 'All are working.' : `${countWord(down.length)} ${down.length === 1 ? 'is' : 'are'} down.`}`;

  const row = (e: Equipment) => {
    const isDown = isEquipmentDown(e.WorkingStatus);
    const amc = amcDays(e, now);
    return (
      <Link key={e.UInsID} to={`/facilities/${encodeURIComponent(e.UInsID)}`} className={clsx(ROW, 'group')}>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text truncate group-hover:underline" title={e.Name}>{e.Name}</p>
          <p className="text-xs text-text-muted truncate">{[e.Location, e.instrument_code].filter(Boolean).join(' · ') || e.UInsID}</p>
        </div>
        {amc !== null && amc >= 0 && amc <= AMC_HORIZON_DAYS && (
          <Badge variant="warning" className="normal-case shrink-0">service contract ends in <span className="font-mono ml-1">{amc} d</span></Badge>
        )}
        <Badge variant={isDown ? 'danger' : 'success'} className="normal-case shrink-0">{isDown ? 'down' : 'working'}</Badge>
      </Link>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* --- 1. Greeting --- */}
      <HomeGreeting
        done={doneCount} total={actions.length + doneCount} sentence={sentence}
        sub={<>{ownStaff?.Designation ?? 'Technical staff'}{divisionCode ? ` · Division ${divisionCode}` : ''}</>}
      />

      {/* --- 2. Ask --- */}
      <AskBox placeholder="Ask SURYA: when is the XRD calibration due?" />

      {/* --- 3. What waits on me --- */}
      <WaitingOnYou actions={actions} now={now} rows={4} />

      {/* --- 4. My instruments --- */}
      <Card className="p-5">
        <p className={BLOCK_TITLE}><span>My instruments</span><Link to="/facilities" className={TITLE_LINK}>All instruments</Link></p>
        {mine.length === 0
          ? <>
            <p className="text-sm text-text-muted">No instrument names you as in charge or as operator. The head of your division can set it on the instrument page.</p>
            {divisionDown.length > 0 && <>
              <p className="text-xs text-text-muted mt-3 mb-1">Down in your division</p>
              {divisionDown.slice(0, 5).map(row)}
            </>}
          </>
          : [...down, ...mine.filter(e => !down.includes(e))].slice(0, 8).map(row)}
        {mine.length > 0 && <p className="text-xs text-text-muted mt-3">Open an instrument to log its use in the logbook.</p>}
      </Card>

      {/* --- 5. Blocks that wait on other work --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <NotConnected title="Today's queue">Booked slots, workshop jobs and training asks will show here.</NotConnected>
        <NotConnected title="Quick entry">One-tap entries for use, a finished job, a fault or low stock will show here.</NotConnected>
        <NotConnected title="My year">Your entries, grouped by appraisal output code, will show here.</NotConnected>
      </div>
    </div>
  );
}
