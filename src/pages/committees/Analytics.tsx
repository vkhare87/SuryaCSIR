import { AnalyticsPlaceholder } from '../../components/viz/AnalyticsPlaceholder';

export default function CommitteesAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Committees"
      upcoming={[
        'Active vs Inactive donut',
        'Meetings per committee bar',
        'Action item status donut',
        'Meeting calendar heatmap',
        'Member-overlap matrix',
      ]}
    />
  );
}
