import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function ProjectsAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Projects"
      upcoming={[
        'FundType donut',
        'Top sponsorers treemap',
        'Project status pie',
        'Gantt-lite timeline',
        'Cost histogram',
        'PI workload bar',
        'Division × FundType heatmap',
        'Project-start calendar heatmap',
      ]}
    />
  );
}
