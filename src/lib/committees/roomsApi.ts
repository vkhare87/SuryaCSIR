import { supabase } from '../../utils/supabaseClient';
import { friendlyError } from '../errors';

export type RoomKind = 'room' | 'vehicle' | 'guest house';

export interface RoomRow {
  id: string;
  name: string;
  kind: RoomKind;
  building: string;
  capacity: number | null;
  facilities: string[];
  active: boolean;
}

export interface RoomBookingRow {
  id: string;
  room_id: string;
  meeting_id: string | null;
  booked_by: string;
  starts_at: string;
  ends_at: string;
  purpose: string;
  status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';
}

export async function listRooms(): Promise<RoomRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('rooms').select('*').eq('active', true).order('kind').order('name');
  if (error) throw error;
  return (data ?? []) as RoomRow[];
}

export async function listRoomBookings(): Promise<RoomBookingRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('room_bookings').select('*').order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoomBookingRow[];
}

export async function bookRoom(
  roomId: string,
  startsAt: string,
  endsAt: string,
  purpose: string,
  meetingId?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not configured' };
  const { data, error } = await supabase.rpc('room_book', {
    p_room_id: roomId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_purpose: purpose,
    p_meeting_id: meetingId ?? null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, id: String(data) };
}

export async function cancelRoomBooking(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Database not configured' };
  const { error } = await supabase.rpc('room_booking_decide', {
    p_booking_id: bookingId,
    p_status: 'CANCELLED',
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}
