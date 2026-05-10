# Requirements — v1.0 Committees & Helpdesk

**Spec:** docs/superpowers/specs/2026-05-07-committees-helpdesk-design.md

## Active (v1.0)

### Committee Management

- [ ] **CMT-01**: User can view committee list with search by name and filter by type/status
- [ ] **CMT-02**: Admin (Director/SystemAdmin/MasterAdmin) can create, edit, and delete committees including member roster management
- [ ] **CMT-03**: User can view committee detail page with 3 tabs: Overview (chairperson, members, mandate), Meetings timeline, and Action Tracker
- [ ] **CMT-04**: Chairperson, secretary, or admin can schedule a meeting with date, venue, title, and agenda items (ordered, with proposer)
- [ ] **CMT-05**: Chairperson, secretary, or admin can write meeting minutes; minutes auto-lock 7 days after meeting completion (admin can override)
- [ ] **CMT-06**: User can upload documents to a meeting (Supabase Storage); all authenticated users can download
- [ ] **CMT-07**: User can create action items (from meeting or standalone) with task description, assignee, deadline; anyone can toggle status (Pending → InProgress → Completed)
- [ ] **CMT-08**: Action Tracker tab shows all action items across committees with filter by status, assignee, deadline (overdue highlight)

### Helpdesk

- [ ] **HD-01**: Any authenticated staff can create a ticket with subject, category (8 options), urgency, and description
- [ ] **HD-02**: System auto-routes new ticket to appropriate handler based on category-to-division/role mapping; routing preview shown before submit
- [ ] **HD-03**: Staff can view their own tickets and their assigned tickets with filter by status, category, urgency
- [ ] **HD-04**: Assigned handler can respond to ticket (conversation thread) and transition status (Open → InProgress → Resolved)
- [ ] **HD-05**: Admin (HRAdmin/SystemAdmin/MasterAdmin) can view all tickets, reassign handler, and force-close any ticket
- [ ] **HD-06**: Ticket detail shows full timeline: events (Created, Assigned, StatusChanged, Resolved, Closed, Reopened) and response thread
- [ ] **HD-07**: Submitter can close their own resolved ticket; resolved tickets auto-close after 14 days of inactivity
- [ ] **HD-08**: Each ticket gets auto-generated token in format AMPRI-YYMMDD-XXX on creation

### Integration

- [ ] **INT-01**: Committees and Helpdesk appear in sidebar navigation, visible to all authenticated users
- [ ] **INT-02**: All routes registered in App.tsx with role-based protection per the permissions matrix
- [ ] **INT-03**: Audit log captures all creates, updates, deletes, and status changes for both modules
- [x] **INT-04**: All new tables (9 domain + audit_log) have RLS enabled with explicit policies

## Future (deferred)

- Email/push notifications for ticket assignments, meeting schedules, action item deadlines
- Committee meeting calendar integration (event types on existing Calendar page)
- Ticket SLA tracking with breach alerts
- Analytics dashboard for ticket resolution metrics

## Out of Scope (explicit)

- Shared ticket engine between committees and helpdesk (decided: separate modules)
- External/guest ticket submission portal
- Real-time chat for ticket resolution (async responses only)
- E-signature on meeting minutes
- Committee budget tracking

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CMT-01 | 2 | pending |
| CMT-02 | 2 | pending |
| CMT-03 | 2 | pending |
| CMT-04 | 2 | pending |
| CMT-05 | 2 | pending |
| CMT-06 | 2 | pending |
| CMT-07 | 2 | pending |
| CMT-08 | 2 | pending |
| HD-01 | 3 | pending |
| HD-02 | 3 | pending |
| HD-03 | 3 | pending |
| HD-04 | 3 | pending |
| HD-05 | 3 | pending |
| HD-06 | 3 | pending |
| HD-07 | 3 | pending |
| HD-08 | 3 | pending |
| INT-01 | 4 | pending |
| INT-02 | 4 | pending |
| INT-03 | 4 | pending |
| INT-04 | 1 | done |
