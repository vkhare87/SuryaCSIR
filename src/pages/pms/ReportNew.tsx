import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { isEligibleAppraisee } from '../../lib/pms/permissions';
import { isPastSelfAppraisalDeadline } from '../../lib/pms/deadlines';
import { Button } from '../../components/ui/Button';

export default function ReportNew() {
  const { cycles, createReport } = usePMS();
  const { user } = useAuth();
  const { staff } = useData();
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState<string | null>(null);

  const openCycle = useMemo(() => cycles.find(c => c.status === 'OPEN'), [cycles]);
  const ownStaff = useMemo(() => staff.find(s => s.Email === user?.email), [staff, user?.email]);

  useEffect(() => {
    if (!openCycle) {
      navigate('/pms', { replace: true });
      return;
    }
    // 2026 guidelines: appraisees up to Scientist F only
    if (ownStaff && !isEligibleAppraisee(ownStaff.Designation)) {
      setBlocked(`PMS appraisal covers Scientists B through F only. Your designation on record is "${ownStaff.Designation}".`);
      return;
    }
    if (isPastSelfAppraisalDeadline(openCycle)) {
      setBlocked('The self-appraisal and AWP submission deadline (May 15) has passed. Contact administration — a non-submission certificate flow applies.');
      return;
    }
    createReport(openCycle.id)
      .then(report => navigate(`/pms/reports/${report.id}/edit`, { replace: true }))
      .catch(() => navigate('/pms', { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (blocked) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <p className="text-sm text-text-muted">{blocked}</p>
        <Button variant="secondary" onClick={() => navigate('/pms')}>Back to PMS</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-32 text-text-muted text-sm">
      Creating report…
    </div>
  );
}
