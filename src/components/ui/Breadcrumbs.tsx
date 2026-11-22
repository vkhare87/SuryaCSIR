import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbCrumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-text-muted">
      {items.map((item, idx) => (
        <span key={item.label} className="inline-flex items-center gap-1">
          {idx > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {item.to && idx < items.length - 1 ? (
            <Link to={item.to} className="hover:text-text hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current={idx === items.length - 1 ? 'page' : undefined} className="text-text font-medium">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
