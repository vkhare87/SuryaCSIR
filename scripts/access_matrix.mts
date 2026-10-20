import { ACCESS_MAP, ALL_ROLES, FEATURE_LABELS } from '../src/constants/access.ts';
const short: Record<string,string> = { Director:'Dir', DivisionHead:'DivH', HOD:'HOD', Scientist:'Sci', Technician:'Tech', HRAdmin:'HR', FinanceAdmin:'Fin', SystemAdmin:'Sys', MasterAdmin:'Mstr', Student:'Stu', ProjectStaff:'PStf', Guest:'Gst', DefaultUser:'Pend', EmpoweredCommittee:'EC' };
console.log('| Feature | Path | ' + ALL_ROLES.map(r => short[r]).join(' | ') + ' |');
console.log('|---|---|' + ALL_ROLES.map(() => ':-:').join('|') + '|');
for (const [p, roles] of Object.entries(ACCESS_MAP)) {
  console.log(`| ${(FEATURE_LABELS as Record<string,string>)[p]} | \`${p}\` | ` + ALL_ROLES.map(r => (roles as string[]).includes(r) ? '●' : '·').join(' | ') + ' |');
}
