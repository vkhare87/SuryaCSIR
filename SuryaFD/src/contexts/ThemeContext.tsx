import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

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

  const setTheme = (t: Theme) => setThemeState(t);
  const setDensity = (d: Density) => {
    setDensityState(d);
    localStorage.setItem('surya_density', d);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, density, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
