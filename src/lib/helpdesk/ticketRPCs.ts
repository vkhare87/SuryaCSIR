import { supabase } from '../../utils/supabaseClient';

interface CreateTicketParams {
  subject: string;
  category: string;
  urgency: string;
  description: string;
  submitted_by: string;
}

interface UpdateStatusParams {
  ticketId: string;
  newStatus: string;
  actorId: string;
}

interface AddResponseParams {
  ticketId: string;
  authorId: string;
  message: string;
}

interface AssignTicketParams {
  ticketId: string;
  newHandlerId: string;
  actorId: string;
}

interface RpcResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Create a new helpdesk ticket via SECURITY DEFINER RPC.
 * The RPC generates the token, inserts the row, and logs a Created event.
 */
export async function createTicket(params: CreateTicketParams): Promise<RpcResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('helpdesk_create_ticket', {
    p_subject: params.subject,
    p_category: params.category,
    p_urgency: params.urgency,
    p_description: params.description,
    p_submitted_by: params.submitted_by,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { ticketId: data } };
}

/**
 * Update ticket status via SECURITY DEFINER RPC.
 * The RPC validates the transition and logs a StatusChanged event.
 */
export async function updateTicketStatus(params: UpdateStatusParams): Promise<RpcResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.rpc('helpdesk_update_status', {
    p_ticket_id: params.ticketId,
    p_new_status: params.newStatus,
    p_actor_id: params.actorId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Add a response to a ticket via SECURITY DEFINER RPC.
 * NOTE: The helpdesk_add_response RPC is created by Plan 03-02.
 * If the RPC doesn't exist yet, the call will fail gracefully.
 */
export async function addResponse(params: AddResponseParams): Promise<RpcResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('helpdesk_add_response', {
    p_ticket_id: params.ticketId,
    p_author_id: params.authorId,
    p_message: params.message,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: { responseId: data } };
}

/**
 * Assign a ticket to a new handler via SECURITY DEFINER RPC.
 * NOTE: The helpdesk_assign_ticket RPC is created by Plan 03-02.
 * If the RPC doesn't exist yet, the call will fail gracefully.
 */
export async function assignTicket(params: AssignTicketParams): Promise<RpcResult> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { error } = await supabase.rpc('helpdesk_assign_ticket', {
    p_ticket_id: params.ticketId,
    p_new_handler_id: params.newHandlerId,
    p_actor_id: params.actorId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
