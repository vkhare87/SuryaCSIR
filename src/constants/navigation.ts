import {
  Users, Briefcase, BookOpen, LayoutDashboard, Calendar as CalendarIcon,
  Building2, Handshake, Activity, FileText, Database, Network, Cloud,
  ClipboardCheck, Ticket as TicketIcon, CalendarDays, UserCog, UserCheck,
  ScanText, Sparkles, Share2, Microscope, SlidersHorizontal, Inbox, Gauge,
  Lightbulb, Link2, Scale, ClipboardList, TrendingUp, GraduationCap, Compass,
  ShieldCheck, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Compass,
    items: [
      { path: '/',                  label: 'Dashboard',         icon: LayoutDashboard, keywords: ['home', 'cockpit'] },
      { path: '/work',              label: 'My Work',           icon: Inbox,           keywords: ['inbox', 'tasks', 'requests'] },
      { path: '/me',                label: 'My Profile',        icon: UserCog,         keywords: ['account', 'researcher'] },
      { path: '/ask',               label: 'Ask SURYA',         icon: Sparkles,        keywords: ['ai', 'rag', 'chat', 'copilot'] },
      { path: '/intelligence',      label: 'Intelligence',      icon: Microscope,      keywords: ['publications', 'patents', 'ip', 'outputs'] },
      { path: '/publication-files', label: 'Publication Files', icon: FileText,        keywords: ['papers', 'clearance'] },
      { path: '/explore',           label: 'Explore Graph',     icon: Share2,          keywords: ['network', 'relations', 'connections'] },
      { path: '/calendar',          label: 'Calendar',          icon: CalendarIcon,    keywords: ['events', 'schedule', 'holidays'] },
    ],
  },
  {
    id: 'hr',
    label: 'People & HR',
    icon: Users,
    items: [
      { path: '/staff',          label: 'Human Capital',      icon: Users,         keywords: ['scientists', 'employees', 'directory'] },
      { path: '/staff/project',  label: 'Project Staff',      icon: UserCog,       keywords: ['contract', 'jrf', 'srf', 'pa'] },
      { path: '/staff/posts',    label: 'Sanctioned Posts',   icon: ClipboardList, keywords: ['vacancies', 'cadre'] },
      { path: '/staff/planning', label: 'Workforce Planning', icon: TrendingUp,    keywords: ['retirement', 'forecast'] },
      { path: '/expertise',      label: 'Expertise Finder',   icon: GraduationCap, keywords: ['skills', 'domain', 'experts'] },
      { path: '/admin/acting',   label: 'Acting Charges',     icon: UserCheck,     keywords: ['orders', 'charge'] },
      { path: '/phd',            label: 'PhD Tracker',        icon: BookOpen,      keywords: ['scholars', 'students', 'thesis'] },
      { path: '/divisions',      label: 'Divisions',          icon: Network,       keywords: ['departments', 'groups', 'hod'] },
      { path: '/recruitment',    label: 'Recruitment',        icon: FileText,      keywords: ['hiring', 'advertisements'] },
    ],
  },
  {
    id: 'research',
    label: 'Research Ops',
    icon: Briefcase,
    items: [
      { path: '/projects',     label: 'Projects',          icon: Briefcase,      keywords: ['grants', 'gap', 'mlp', 'csp'] },
      { path: '/proposals',    label: 'Proposals',         icon: FileText,       keywords: ['draft', 'funding'] },
      { path: '/reports',      label: 'Progress Reports',  icon: ClipboardCheck, keywords: ['quarterly', 'annual'] },
      { path: '/facilities',   label: 'Instruments',       icon: Building2,      keywords: ['equipment', 'labs', 'facilities'] },
      { path: '/partnerships', label: 'Partnerships',      icon: Handshake,      keywords: ['mou', 'tech transfer', 'industry'] },
      { path: '/rnd-monitor',  label: 'R&D Monitor',       icon: Activity,       keywords: ['tracking', 'metrics'] },
      { path: '/portfolio',    label: 'Project Portfolio', icon: Gauge,          keywords: ['director', 'funding', 'overview'] },
      { path: '/lessons',      label: 'Lessons Learned',   icon: Lightbulb,      keywords: ['closure', 'memory'] },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: ShieldCheck,
    items: [
      { path: '/committees', label: 'Committees',       icon: Building2,      keywords: ['meetings', 'minutes', 'actions'] },
      { path: '/helpdesk',   label: 'Helpdesk',         icon: TicketIcon,     keywords: ['tickets', 'support', 'issues'] },
      { path: '/pms',        label: 'Performance Mgmt', icon: ClipboardCheck, keywords: ['appraisal', 'awp', 'evaluation'] },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Wrench,
    items: [
      { path: '/admin/access-requests', label: 'Access Requests',  icon: UserCheck,         keywords: ['users', 'approvals'] },
      { path: '/admin/features',        label: 'Feature Controls', icon: SlidersHorizontal, keywords: ['flags', 'grants', 'permissions'] },
      { path: '/data',                  label: 'Data Management',  icon: Database,          keywords: ['import', 'csv', 'excel'] },
      { path: '/data/links',            label: 'People Links',     icon: Link2,             keywords: ['identity', 'authors'] },
      { path: '/admin/rules',           label: 'CSIR Rules',       icon: Scale,             keywords: ['policy', 'guidelines'] },
      { path: '/irins-sync',            label: 'IRINS Sync',       icon: Cloud,             keywords: ['orcid', 'vidwan'] },
      { path: '/admin/rag',             label: 'RAG Ingestion',    icon: ScanText,          keywords: ['embeddings', 'documents', 'ocr'] },
      { path: '/admin/holidays',        label: 'Holidays',         icon: CalendarDays,      keywords: ['gazetted', 'rh'] },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap(section => section.items);
