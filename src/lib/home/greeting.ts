export function timeOfDayGreeting(now: Date = new Date()): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function buildGreetingSentence(
  staffName: string | null | undefined,
  pendingCount: number,
  doneTodayCount: number,
  now: Date = new Date(),
): string {
  const greet = timeOfDayGreeting(now);
  const cleanName = staffName?.trim();
  if (!cleanName) {
    return `${greet}. Your login is not linked to a staff record yet — ask an administrator to link it under People Links.`;
  }
  if (pendingCount <= 0) {
    if (doneTodayCount > 0) {
      return `${greet}, ${cleanName}. All ${doneTodayCount} item${doneTodayCount === 1 ? '' : 's'} cleared today.`;
    }
    return `${greet}, ${cleanName}. Nothing is waiting on you right now.`;
  }
  return `${greet}, ${cleanName}. ${pendingCount} thing${pendingCount === 1 ? ' is' : 's are'} left today.`;
}
