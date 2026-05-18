import { AnalyticsPlaceholder } from '../components/viz/AnalyticsPlaceholder';

export default function RecruitmentAnalytics() {
  return (
    <AnalyticsPlaceholder
      section="Recruitment"
      upcoming={[
        'Hiring funnel (Received → Shortlisted → Interviewed → Selected → Rejected)',
        'Vacancy status pie',
        'Time-to-fill histogram',
        'Applicants per vacancy bar',
      ]}
    />
  );
}
