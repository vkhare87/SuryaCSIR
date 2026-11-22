import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useData } from '../../../contexts/DataContext';
import { useHome } from '../../../contexts/HomeContext';

export function PeopleBlock() {
  const { staff } = useData();
  const { ownStaff } = useHome();
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? staff.filter((s) => s.Name.toLowerCase().includes(q) || s.Division.toLowerCase().includes(q))
      : ownStaff
        ? staff.filter((s) => s.Division === ownStaff.Division && s.ID !== ownStaff.ID)
        : staff;
    return pool.slice(0, 5);
  }, [staff, ownStaff, query]);

  return (
    <section aria-label="People" className="rounded-xl border border-border bg-surface p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Users size={13} /> People
        </h2>
        <Link to="/staff" className="text-xs text-text-muted hover:text-text hover:underline">
          Directory
        </Link>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find colleague…"
        aria-label="Find colleague"
        className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-text placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-blue"
      />

      {matches.length === 0 ? (
        <p className="text-xs text-text-muted">No matching colleagues.</p>
      ) : (
        <ul className="space-y-1.5">
          {matches.map((s) => (
            <li key={s.ID} className="flex items-baseline justify-between gap-2 text-xs">
              <Link to={`/staff/${encodeURIComponent(s.ID)}`} className="text-text hover:underline truncate">
                {s.Name}
              </Link>
              <span className="font-mono text-[11px] text-text-muted shrink-0">{s.Division}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
