-- Read-only preview for remove_mock_helpdesk_20261020.sql: what it would delete.
WITH mock AS (
    SELECT id
      FROM public.tickets
     WHERE id::text LIKE 'aaaa1111-aaaa-aaaa-aaaa-%'
       AND token IN (
            'AMPRI-260330-001','AMPRI-260408-001','AMPRI-260410-001','AMPRI-260415-001',
            'AMPRI-260418-001','AMPRI-260420-001','AMPRI-260425-001','AMPRI-260430-001',
            'AMPRI-260501-001','AMPRI-260501-002','AMPRI-260502-001','AMPRI-260502-002',
            'AMPRI-260503-001','AMPRI-260503-002','AMPRI-260504-001','AMPRI-260504-002',
            'AMPRI-260505-001','AMPRI-260506-001','AMPRI-260506-002','AMPRI-260507-001')
)
SELECT
    (SELECT count(*) FROM mock)                                                     AS demo_tickets,
    (SELECT count(*) FROM public.tickets WHERE id::text LIKE 'aaaa1111-aaaa-aaaa-aaaa-%') AS reserved_range_tickets,
    (SELECT count(*) FROM public.ticket_responses WHERE ticket_id IN (SELECT id FROM mock)) AS responses_cascade,
    (SELECT count(*) FROM public.ticket_events    WHERE ticket_id IN (SELECT id FROM mock)) AS events_cascade,
    (SELECT count(*) FROM public.notifications n, mock m
      WHERE n.kind = 'ticket'
        AND (n.dedupe_key = 'ticket:' || m.id OR n.link = '/helpdesk/' || m.id))   AS notifications,
    (SELECT count(*) FROM public.tickets) - (SELECT count(*) FROM mock)              AS real_tickets_kept;
