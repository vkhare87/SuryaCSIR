import type { VacancyAdvertisement } from '../../types';

interface PostRow { advertisement_id: string; designation: string | null; no_of_positions: number | null }

/** Fill each advertisement's designation and position count from its vacancy_posts rows. */
export function withPostTotals(ads: VacancyAdvertisement[], posts: PostRow[]): VacancyAdvertisement[] {
  return ads.map(ad => {
    const mine = posts.filter(p => p.advertisement_id === ad.id);
    return {
      ...ad,
      designation: [...new Set(mine.map(p => p.designation).filter(Boolean))].join(', '),
      numberOfPositions: mine.reduce((n, p) => n + (p.no_of_positions ?? 0), 0),
    };
  });
}
