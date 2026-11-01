import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Density = 'compact' | 'medium' | 'relaxed';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  density: Density;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('surya_theme') as Theme) || 'light';
  });
  const [density, setDensityState] = useState<Density>(() => {
    return (localStorage.getItem('surya_density') as Density) || 'medium';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('surya_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    localStorage.setItem('surya_density', d);
  }, []);

  const value = useMemo(() => ({ theme, setTheme: setThemeState, density, setDensity }), [theme, density, setDensity]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
