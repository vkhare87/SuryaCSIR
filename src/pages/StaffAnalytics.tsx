import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function StaffAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Staff"
      upcoming={[
        'Headcount by Division (click → filter)',
        'Designation pyramid',
        'Service tenure histogram',
        'Retirement runway bar',
        'Org hierarchy tree (Phase 5)',
        'Collaboration network graph (Phase 5)',
      ]}
    />
  );
}
