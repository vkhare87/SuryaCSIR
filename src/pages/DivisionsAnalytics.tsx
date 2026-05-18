import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function DivisionsAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Divisions"
      upcoming={[
        'Sanctioned vs Current grouped bar',
        'Research-area × Division heatmap',
        'Treemap sized by current strength',
        'Active projects per division bar',
        'Publications-per-scientist density bar',
      ]}
    />
  );
}
