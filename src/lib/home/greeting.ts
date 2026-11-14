const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** A count as a word up to twelve, then as digits. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function partOfDay(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface GreetingInput {
  /** Empty when the account has no linked staff row. */
  name: string;
  hour: number;
  /** Open items. */
  left: number;
  overdue: number;
}

/** "Two people wait on your answer." — empty when nobody waits. */
export function waitingLine(n: number): string {
  return n === 0 ? '' : ` ${countWord(n)} ${n === 1 ? 'person waits' : 'people wait'} on your answer.`;
}

/** The one sentence at the top of a home screen (DESIGN.md R5). */
export function greeting({ name, hour, left, overdue }: GreetingInput): string {
  const hello = name ? `${partOfDay(hour)}, ${name}.` : `${partOfDay(hour)}.`;
  if (left === 0) return `${hello} Nothing is waiting on you.`;
  const things = `${countWord(left)} ${left === 1 ? 'thing is' : 'things are'} left.`;
  if (overdue === 0) return `${hello} ${things}`;
  return `${hello} ${things} ${countWord(overdue)} ${overdue === 1 ? 'is' : 'are'} overdue.`;
}
