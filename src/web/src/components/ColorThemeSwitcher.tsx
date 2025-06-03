import React from 'react';
import { Button } from './ui/button';
import { useColorTheme, colorThemes, type ColorThemeId } from '../contexts/ColorThemeContext';

interface ColorThemeSwitcherProps {
  showLabel?: boolean;
}

export function ColorThemeSwitcher({ showLabel = true }: ColorThemeSwitcherProps) {
  const { currentTheme, setTheme } = useColorTheme();

  // Test CSS variables
  React.useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const primary = root.getPropertyValue('--primary');
    const accent = root.getPropertyValue('--accent');
    console.log('Current CSS variables:', { primary, accent, theme: currentTheme });
  }, [currentTheme]);

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
                id === 'purple' ? 'bg-violet-500' :
                'bg-gray-500'
              }`}
            />
            <span>{theme.name}</span>
          </Button>
        ))}
      </div>
      {/* Debug: Visual color test */}
      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-primary rounded" />
          <span>Primary color (should change with theme)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-accent rounded" />
          <span>Accent color (should change with theme)</span>
        </div>
        <div className="text-muted-foreground">
          Current theme: {currentTheme}
        </div>
      </div>
    </div>
  );
}