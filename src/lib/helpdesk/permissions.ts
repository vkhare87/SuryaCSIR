import type { UserAccount, Ticket } from '../../types';

const ADMIN_ROLES = ['HRAdmin', 'SystemAdmin', 'MasterAdmin'] as const;

/** Check if user holds an admin helpdesk role (HRAdmin, SystemAdmin, MasterAdmin). */
export function isAdmin(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

/** All authenticated users can create tickets. */
export function canCreateTicket(_user: UserAccount): boolean {
  return true;
}

/** Only admin roles can view all tickets across all divisions. */
export function canViewAllTickets(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

/**
 * Division-scoped ticket visibility.
 * Phase 3 defers full division scoping (RESEARCH.md open question #3).
 * All authenticated roles can see tickets in their division scope via tabs D-02/D-04.
 */
export function canViewDivisionTickets(_user: UserAccount): boolean {
  return true;
}

/** User can respond if they are the submitter or the assigned handler. */
export function canRespond(user: UserAccount, ticket: Ticket): boolean {
  return user.id === ticket.submitted_by || user.id === ticket.assigned_to;
}

/**
 * Determine whether a user can transition a ticket to a given target status.
 *
 * CLIENT-SIDE UX ONLY — the actual authorization check runs server-side
 * in the SECURITY DEFINER RPC. This function gates UI button visibility.
 *
 * Rules:
 * - Admin roles (HRAdmin/SystemAdmin/MasterAdmin): any valid transition
 * - Handler (assigned_to): Open→InProgress, InProgress→Resolved
 * - Submitter: only Resolved→Closed (closing their own resolved ticket)
 * - No-op transition (target === current status) always denied
 */
export function canTransitionStatus(
  user: UserAccount,
  ticket: Ticket,
  targetStatus: string,
): boolean {
  // No-op: cannot transition to same status
  if (targetStatus === ticket.status) return false;

  // Guard: only known statuses are valid targets
  const VALID_STATUSES = ['Open', 'InProgress', 'Resolved', 'Closed'] as const;
  if (!(VALID_STATUSES as readonly string[]).includes(targetStatus)) return false;

  // Admin roles can do any valid transition
  if ((ADMIN_ROLES as readonly string[]).includes(user.activeRole)) return true;

  // Handler (assigned_to user) transitions
  if (user.id === ticket.assigned_to) {
    if (ticket.status === 'Open' && targetStatus === 'InProgress') return true;
    if (ticket.status === 'InProgress' && targetStatus === 'Resolved') return true;
    return false;
  }

  // Submitter transition: can close only their own resolved ticket
  if (user.id === ticket.submitted_by) {
    if (ticket.status === 'Resolved' && targetStatus === 'Closed') return true;
    return false;
  }

  return false;
}

/** Submitter can close their own resolved ticket. Admin can close any resolved ticket. */
export function canCloseTicket(user: UserAccount, ticket: Ticket): boolean {
  if (ticket.status !== 'Resolved') return false;
  if ((ADMIN_ROLES as readonly string[]).includes(user.activeRole)) return true;
  return user.id === ticket.submitted_by;
}

/** Only admin roles can reassign a ticket to a different handler. */
export function canReassign(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

/** Only admin roles can force-close a ticket. */
export function canForceClose(user: UserAccount): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(user.activeRole);
}

/** Handler or admin can reopen a Closed ticket. */
export function canReopenTicket(user: UserAccount, ticket: Ticket): boolean {
  if (ticket.status !== 'Closed') return false;
  if ((ADMIN_ROLES as readonly string[]).includes(user.activeRole)) return true;
  return user.id === ticket.assigned_to;
}
