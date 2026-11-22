/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AskEntity } from '../lib/ask/client';

function safeDecode(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * Infers an Ask SURYA context entity from the active route pathname + search
 * so pressing ⌘J on a Project, Staff, Instrument, or Division page scopes the
 * copilot automatically.
 */
export function inferRouteEntity(pathname: string, search = ''): AskEntity | null {
  const segs = pathname.split('/').filter(Boolean);
  if (segs[0] === 'projects' && segs.length === 2) {
    return { type: 'project', id: safeDecode(segs[1]) };
  }
  if (segs[0] === 'staff' && segs.length === 2 && !['analytics', 'project', 'posts', 'planning'].includes(segs[1])) {
    return { type: 'staff', id: safeDecode(segs[1]) };
  }
  if (segs[0] === 'facilities' && segs.length === 2) {
    return { type: 'instrument', id: safeDecode(segs[1]) };
  }
  if (segs[0] === 'divisions' && search) {
    const div = new URLSearchParams(search).get('div');
    if (div) return { type: 'division', id: div };
  }
  return null;
}

export interface OpenCopilotOptions {
  entity?: AskEntity | null;
  question?: string;
}

interface CopilotContextType {
  isOpen: boolean;
  entityOverride: AskEntity | null | undefined;
  initialQuestion: string;
  openCopilot: (opts?: OpenCopilotOptions) => void;
  closeCopilot: () => void;
}

const CopilotContext = createContext<CopilotContextType | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [entityOverride, setEntityOverride] = useState<AskEntity | null | undefined>(undefined);
  const [initialQuestion, setInitialQuestion] = useState('');

  const openCopilot = useCallback((opts?: OpenCopilotOptions) => {
    setEntityOverride(opts && 'entity' in opts ? opts.entity : undefined);
    setInitialQuestion(opts?.question ?? '');
    setIsOpen(true);
  }, []);

  const closeCopilot = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isOpen, entityOverride, initialQuestion, openCopilot, closeCopilot }),
    [isOpen, entityOverride, initialQuestion, openCopilot, closeCopilot],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

/** Optional hook: returns null outside CopilotProvider (e.g., isolated unit tests). */
export function useCopilot(): CopilotContextType | null {
  return useContext(CopilotContext);
}
