import { useEffect, type ReactNode } from 'react';
import { useHome } from '../../contexts/HomeContext';
import { CommonDesk } from './CommonDesk';

interface HomeShellProps {
  children: ReactNode;
  showCommonDesk?: boolean;
}

export function HomeShell({ children, showCommonDesk = true }: HomeShellProps) {
  const { ensureLoaded } = useHome();

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  if (!showCommonDesk) {
    return <div className="space-y-6">{children}</div>;
  }

  return (
    <div className="flex flex-col min-[1100px]:flex-row items-start gap-6">
      <div className="flex-1 min-w-0 w-full space-y-6">
        {children}
      </div>
      <CommonDesk />
    </div>
  );
}
