import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** clsx + tailwind-merge — lets variant classes be overridden by caller className. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
