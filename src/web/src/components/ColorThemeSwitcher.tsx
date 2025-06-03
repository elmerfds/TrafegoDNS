import React from 'react';
import { Button } from './ui/button';
import { useColorTheme, colorThemes, type ColorThemeId } from '../contexts/ColorThemeContext';

interface ColorThemeSwitcherProps {
  showLabel?: boolean;
}

export function ColorThemeSwitcher({ showLabel = true }: ColorThemeSwitcherProps) {
  const { currentTheme, setTheme } = useColorTheme();

  return (
    <div className="space-y-3">
      {showLabel && (
        <div className="text-sm font-medium">Accent Color:</div>
      )}
      <div className="flex flex-wrap gap-2">
        {Object.entries(colorThemes).map(([id, theme]) => (
          <Button
            key={id}
            variant={currentTheme === id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme(id as ColorThemeId)}
            className="flex items-center space-x-2"
            title={theme.description}
          >
            <div
              className={`w-3 h-3 rounded-full ${
                id === 'teal' ? 'bg-teal-500' :
                id === 'gold' ? 'bg-amber-500' :
                id === 'blue' ? 'bg-blue-500' :
                'bg-purple-500'
              }`}
            />
            <span>{theme.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}