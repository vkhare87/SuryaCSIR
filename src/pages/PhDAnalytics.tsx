import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function PhDAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="PhD"
      upcoming={[
        'Status donut',
        'Specialization treemap',
        'Supervisor workload bar',
        'Enrollment trend line',
        'Duration histogram',
      ]}
    />
  );
}
