import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// Available color themes
export const colorThemes = {
  teal: {
    name: 'Teal',
    id: 'teal',
    description: 'Modern teal accent with clean aesthetics',
    className: '', // Default, no class needed
  },
  gold: {
    name: 'Gold Classic',
    id: 'gold', 
    description: 'Classic gold accent theme',
    className: 'theme-gold',
  },
  blue: {
    name: 'Professional Blue',
    id: 'blue',
    description: 'Clean professional blue theme',
    className: 'theme-blue',
  },
  purple: {
    name: 'Creative Purple',
    id: 'purple',
    description: 'Modern purple theme for creative feel',
    className: 'theme-purple',
  },
};

export type ColorThemeId = keyof typeof colorThemes;

interface ColorThemeContextType {
  currentTheme: ColorThemeId;
  setTheme: (themeId: ColorThemeId) => void;
  themes: typeof colorThemes;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ColorThemeId>('teal');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Load theme from API for authenticated users, localStorage for guests
  useEffect(() => {
    const loadTheme = async () => {
      if (isAuthenticated) {
        try {
          const response = await api.get('/auth/theme');
          const themeId = response.data.data.theme;
          if (themeId && colorThemes[themeId as ColorThemeId]) {
            setCurrentTheme(themeId as ColorThemeId);
          }
        } catch (error) {
          console.warn('Failed to load theme from server, using localStorage fallback');
          const savedTheme = localStorage.getItem('trafegodns-color-theme') as ColorThemeId;
          if (savedTheme && colorThemes[savedTheme]) {
            setCurrentTheme(savedTheme);
          }
        }
      } else {
        const savedTheme = localStorage.getItem('trafegodns-color-theme') as ColorThemeId;
        if (savedTheme && colorThemes[savedTheme]) {
          setCurrentTheme(savedTheme);
        }
      }
    };

    loadTheme();
  }, [isAuthenticated]);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    
    // Remove all theme classes from both html and body
    Object.values(colorThemes).forEach(theme => {
      if (theme.className) {
        root.classList.remove(theme.className);
        body.classList.remove(theme.className);
      }
    });
    
    // Also set data attribute for CSS selectors
    root.removeAttribute('data-theme');
    
    // Add current theme class to both html and body
    const currentThemeClass = colorThemes[currentTheme].className;
    if (currentThemeClass) {
      root.classList.add(currentThemeClass);
      body.classList.add(currentThemeClass);
      root.setAttribute('data-theme', currentTheme);
      console.log(`Applied color theme: ${currentTheme} (class: ${currentThemeClass})`);
    } else {
      root.setAttribute('data-theme', 'teal');
      console.log(`Applied color theme: ${currentTheme} (default teal)`);
    }
    
    // Force style recalculation
    void root.offsetHeight;
  }, [currentTheme]);

  const setTheme = async (themeId: ColorThemeId) => {
    setCurrentTheme(themeId);
    
    if (isAuthenticated) {
      try {
        await api.put('/auth/theme', { theme: themeId });
      } catch (error) {
        console.error('Failed to save theme to server:', error);
        localStorage.setItem('trafegodns-color-theme', themeId);
      }
    } else {
      localStorage.setItem('trafegodns-color-theme', themeId);
    }
  };

  return (
    <ColorThemeContext.Provider value={{ currentTheme, setTheme, themes: colorThemes }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (context === undefined) {
    throw new Error('useColorTheme must be used within a ColorThemeProvider');
  }
  return context;
}