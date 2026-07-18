import { useMemo, useState } from 'react';
import { useFeatureControls } from '../../contexts/FeatureControlContext';
import { Card, Badge } from '../ui/Cards';
import { FEATURE_LABELS, type AccessPath } from '../../constants/access';
import { FEATURE_GROUPS, featureRoleSummary } from '../../lib/access/featureControls';

const ALL_CONTROLLABLE_PATHS: AccessPath[] = FEATURE_GROUPS.flatMap((g) => g.paths);

export function FeatureRoleLookup() {
  const { controls } = useFeatureControls();
  const [path, setPath] = useState<AccessPath>(ALL_CONTROLLABLE_PATHS[0]);

  const control = useMemo(() => controls.find((c) => c.feature_key === path), [controls, path]);
  const summary = useMemo(() => featureRoleSummary(path, control), [path, control]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-text-muted uppercase tracking-wide">Feature Lookup</h2>
          <p className="text-xs text-text-muted mt-0.5">Pick a feature to see how exposed it currently is. Read-only.</p>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm" htmlFor="feature-lookup-select">
          <span className="text-text-muted font-medium">Feature</span>
          <select
            id="feature-lookup-select"
            value={path}
            onChange={(e) => setPath(e.target.value as AccessPath)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
          >
            {FEATURE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.paths.map((p) => (
                  <option key={p} value={p}>{FEATURE_LABELS[p]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="px-6 py-4 space-y-2">
        <p className="text-sm text-text">
          Enabled for <span className="font-semibold">{summary.enabledCount} of {summary.totalEligible}</span> eligible roles
        </p>
        {summary.globallyKilled && <Badge variant="danger">Off for everyone</Badge>}
        {!summary.globallyKilled && summary.blockedRoles.length > 0 && (
          <p className="text-xs text-text-muted">Blocked: {summary.blockedRoles.join(', ')}</p>
        )}
      </div>
    </Card>
  );
}
