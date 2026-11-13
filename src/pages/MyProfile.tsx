import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

// ponytail: /me is the person's own /staff/:id — StaffDetail shows the
// self-edit form when the row's user_id is the caller.
export default function MyProfile() {
  const { user } = useAuth();
  const { staff, isLoading } = useData();
  const me = staff.find(s => s.user_id && s.user_id === user?.id);

  if (me) return <Navigate to={`/staff/${encodeURIComponent(me.ID)}`} replace />;
  if (isLoading) return <p className="text-sm text-text-muted">Loading…</p>;
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-text">Your login is not linked to a staff record yet.</p>
      <p className="text-text-muted text-sm mt-1">Ask HR to link it. Then your research profile appears here.</p>
    </div>
  );
}
