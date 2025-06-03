import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// Theme definitions
export const themes = {
  teal: {
    name: 'Teal',
    id: 'teal',
    description: 'Modern teal accent with clean aesthetics',
    colors: {
      primary: '20 184 166',        // teal-500
      primaryForeground: '255 255 255',
      secondary: '240 253 250',     // teal-50
      secondaryForeground: '19 78 74', // teal-800
      accent: '153 246 228',        // teal-200
      accentForeground: '19 78 74', // teal-800
      muted: '248 250 252',         // slate-50
      mutedForeground: '100 116 139', // slate-500
      border: '226 232 240',        // slate-200
      ring: '20 184 166',           // teal-500
      success: '34 197 94',         // green-500
      warning: '245 158 11',        // amber-500
      destructive: '239 68 68',     // red-500
    }
  },
  gold: {
    name: 'Gold Classic',
    id: 'gold', 
    description: 'Classic gold accent theme',
    colors: {
      primary: '245 158 11',        // amber-500 (gold)
      primaryForeground: '255 255 255',
      secondary: '255 251 235',     // amber-50
      secondaryForeground: '146 64 14', // amber-800
      accent: '252 211 77',         // amber-300
      accentForeground: '146 64 14', // amber-800
      muted: '248 250 252',         // slate-50
      mutedForeground: '100 116 139', // slate-500
      border: '226 232 240',        // slate-200
      ring: '245 158 11',           // amber-500
      success: '34 197 94',         // green-500
      warning: '245 158 11',        // amber-500
      destructive: '239 68 68',     // red-500
    }
  },
  blue: {
    name: 'Professional Blue',
    id: 'blue',
    description: 'Clean professional blue theme',
    colors: {
      primary: '59 130 246',        // blue-500
      primaryForeground: '255 255 255',
      secondary: '239 246 255',     // blue-50
      secondaryForeground: '30 58 138', // blue-800
      accent: '147 197 253',        // blue-300
      accentForeground: '30 58 138', // blue-800
      muted: '248 250 252',         // slate-50
      mutedForeground: '100 116 139', // slate-500
      border: '226 232 240',        // slate-200
      ring: '59 130 246',           // blue-500
      success: '34 197 94',         // green-500
      warning: '245 158 11',        // amber-500
      destructive: '239 68 68',     // red-500
    }
  },
  purple: {
    name: 'Creative Purple',
    id: 'purple',
    description: 'Modern purple theme for creative feel',
    colors: {
      primary: '139 92 246',        // violet-500
      primaryForeground: '255 255 255',
      secondary: '245 243 255',     // violet-50
      secondaryForeground: '76 29 149', // violet-800
      accent: '196 181 253',        // violet-300
      accentForeground: '76 29 149', // violet-800
      muted: '248 250 252',         // slate-50
      mutedForeground: '100 116 139', // slate-500
      border: '226 232 240',        // slate-200
      ring: '139 92 246',           // violet-500
      success: '34 197 94',         // green-500
      warning: '245 158 11',        // amber-500
      destructive: '239 68 68',     // red-500
    }
  }
};

export type ThemeId = keyof typeof themes;

interface ThemeContextType {
  currentTheme: ThemeId;
  setTheme: (themeId: ThemeId) => void;
  themes: typeof themes;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('teal'); // Default to teal
  const [isLoading, setIsLoading] = useState(true);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Load theme from API for authenticated users, localStorage for guests
  useEffect(() => {
    const loadTheme = async () => {
      if (isAuthenticated) {
        try {
          const response = await api.get('/auth/theme');
          const themeId = response.data.data.theme;
          if (themeId && themes[themeId as ThemeId]) {
            setCurrentTheme(themeId as ThemeId);
          }
        } catch (error) {
          console.warn('Failed to load theme from server, using localStorage fallback');
          // Fallback to localStorage
          const savedTheme = localStorage.getItem('trafegodns-color-theme') as ThemeId;
          if (savedTheme && themes[savedTheme]) {
            setCurrentTheme(savedTheme);
          }
        }
      } else {
        // For non-authenticated users, use localStorage
        const savedTheme = localStorage.getItem('trafegodns-color-theme') as ThemeId;
        if (savedTheme && themes[savedTheme]) {
          setCurrentTheme(savedTheme);
        }
      }
      setIsLoading(false);
    };

    loadTheme();
  }, [isAuthenticated]);

  // Apply theme to CSS variables
  useEffect(() => {
    const theme = themes[currentTheme];
    const root = document.documentElement;

    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVar, value);
    });
  }, [currentTheme]);

  const setTheme = async (themeId: ThemeId) => {
    setCurrentTheme(themeId);
    
    if (isAuthenticated) {
      try {
        await api.put('/auth/theme', { theme: themeId });
      } catch (error) {
        console.error('Failed to save theme to server:', error);
        // Fallback to localStorage even for authenticated users
        localStorage.setItem('trafegodns-color-theme', themeId);
      }
    } else {
      // For non-authenticated users, use localStorage
      localStorage.setItem('trafegodns-color-theme', themeId);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}