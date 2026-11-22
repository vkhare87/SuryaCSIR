import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, DoorOpen, X } from 'lucide-react';
import { Card } from '../../components/ui/Cards';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../contexts/ToastContext';
import {
  bookRoom, cancelRoomBooking, listRoomBookings, listRooms,
  type RoomBookingRow, type RoomRow,
} from '../../lib/committees/roomsApi';
import { friendlyError } from '../../lib/errors';

const KIND_LABELS: Record<RoomRow['kind'], string> = {
  room: 'Meeting Room',
  vehicle: 'Vehicle',
  'guest house': 'Guest House',
};

export default function RoomsAdmin() {
  const { push } = useToast();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [bookings, setBookings] = useState<RoomBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rm, bk] = await Promise.all([listRooms(), listRoomBookings()]);
      setRooms(rm);
      setBookings(bk);
      if (rm.length > 0) setRoomId((prev) => prev || rm[0].id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomId || !startsAt || !endsAt) return;
    setSubmitting(true);
    const res = await bookRoom(roomId, new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), purpose);
    setSubmitting(false);
    if (!res.ok) {
      push(res.error, 'error');
      return;
    }
    push('Booking confirmed', 'success');
    setPurpose('');
    await load();
  };

  const onCancel = async (id: string) => {
    const res = await cancelRoomBooking(id);
    if (!res.ok) {
      push(res.error, 'error');
      return;
    }
    push('Booking cancelled', 'success');
    await load();
  };

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Room';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-[500] font-serif text-text flex items-center gap-2">
          <DoorOpen size={22} className="text-terracotta" /> Rooms, Vehicles &amp; Guest House
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Book institute meeting rooms, vehicles, and guest house suites with automatic clash detection.
        </p>
      </div>

      {!loading && error && rooms.length === 0 ? (
        <EmptyState variant="error" title="Couldn't load rooms" description={error} />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
              Book a resource
            </h2>
            <form onSubmit={onBook} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs text-text-muted mb-1">Resource</label>
                <select
                  aria-label="Resource"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({KIND_LABELS[r.kind]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">From</label>
                <input
                  type="datetime-local"
                  aria-label="From"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">To</label>
                <input
                  type="datetime-local"
                  aria-label="To"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Purpose"
                  placeholder="Purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm text-text"
                />
                <Button type="submit" disabled={submitting || rooms.length === 0}>
                  Book
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <CalendarClock size={13} /> Active bookings
            </h2>
            {bookings.filter((b) => b.status !== 'CANCELLED').length === 0 ? (
              <p className="text-xs text-text-muted">No upcoming bookings.</p>
            ) : (
              <ul className="divide-y divide-border">
                {bookings
                  .filter((b) => b.status !== 'CANCELLED')
                  .map((b) => (
                    <li key={b.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-text truncate">{roomName(b.room_id)} · {b.purpose || 'Booking'}</p>
                        <p className="font-mono tabular-nums text-text-muted">
                          {new Date(b.starts_at).toLocaleString('en-IN')} → {new Date(b.ends_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCancel(b.id)}
                        aria-label={`Cancel ${roomName(b.room_id)} booking`}
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-surface-hover"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
