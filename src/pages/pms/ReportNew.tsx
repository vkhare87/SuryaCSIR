import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePMS } from '../../contexts/PMSContext';

export default function ReportNew() {
  const { cycles, createReport } = usePMS();
  const navigate = useNavigate();

  useEffect(() => {
    const openCycle = cycles.find(c => c.status === 'OPEN');
    if (!openCycle) {
      navigate('/pms', { replace: true });
      return;
    }
    createReport(openCycle.id)
      .then(report => navigate(`/pms/reports/${report.id}/edit`, { replace: true }))
      .catch(() => navigate('/pms', { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center h-32 text-text-muted text-sm">
      Creating report…
    </div>
  );
}
