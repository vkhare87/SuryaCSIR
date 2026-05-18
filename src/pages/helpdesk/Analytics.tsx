import { AnalyticsPlaceholder } from '../../components/viz/AnalyticsPlaceholder';

export default function HelpdeskAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Helpdesk"
      upcoming={[
        'Status donut',
        'Urgency × Category heatmap',
        'Resolution-time histogram',
        'Daily volume trend line',
        'Assignee workload bar',
        'Ticket-creation calendar heatmap',
      ]}
    />
  );
}
