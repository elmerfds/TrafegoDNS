import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Palette } from 'lucide-react';
import { useTheme, themes, type ThemeId } from '../contexts/ThemeContext';

interface ThemeSwitcherProps {
  variant?: 'select' | 'button';
  showLabel?: boolean;
}

export function ThemeSwitcher({ variant = 'select', showLabel = true }: ThemeSwitcherProps) {
  const { currentTheme, setTheme } = useTheme();

  if (variant === 'button') {
    return (
      <div className="flex items-center space-x-2">
        {showLabel && <span className="text-sm font-medium">Theme:</span>}
        <div className="flex space-x-1">
          {Object.entries(themes).map(([id, theme]) => (
            <Button
              key={id}
              variant={currentTheme === id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme(id as ThemeId)}
              className="px-3 py-1 text-xs"
              title={theme.description}
            >
              <div
                className="w-3 h-3 rounded-full mr-2"
                style={{
                  backgroundColor: `rgb(${theme.colors.primary})`
                }}
              />
              {theme.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {showLabel && (
        <div className="flex items-center space-x-1">
          <Palette className="h-4 w-4" />
          <span className="text-sm font-medium">Theme:</span>
        </div>
      )}
      <Select value={currentTheme} onValueChange={(value) => setTheme(value as ThemeId)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue>
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: `rgb(${themes[currentTheme].colors.primary})`
                }}
              />
              <span>{themes[currentTheme].name}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(themes).map(([id, theme]) => (
            <SelectItem key={id} value={id}>
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: `rgb(${theme.colors.primary})`
                  }}
                />
                <div>
                  <div className="font-medium">{theme.name}</div>
                  <div className="text-xs text-muted-foreground">{theme.description}</div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}