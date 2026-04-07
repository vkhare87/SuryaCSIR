import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ViewMode = 'AUTO' | 'MOBILE' | 'DESKTOP';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface UIContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('AUTO');
  const [deviceType, setDeviceType] = useState<DeviceType>('desktop');

  useEffect(() => {
    const handleResize = () => {
      if (viewMode === 'AUTO') {
        const width = window.innerWidth;
        if (width < 768) setDeviceType('mobile');
        else if (width < 1024) setDeviceType('tablet');
        else setDeviceType('desktop');
      } else {
        setDeviceType(viewMode.toLowerCase() as DeviceType);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  const value = {
    viewMode,
    setViewMode,
    deviceType,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
