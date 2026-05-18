import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function FacilitiesAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Equipment"
      upcoming={[
        'Working status donut',
        'Per-lab equipment count bar',
        'AMC expiry calendar heatmap',
        'Division × Lab utilization heatmap',
      ]}
    />
  );
}
