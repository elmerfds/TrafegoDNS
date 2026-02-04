/**
 * Header Component
 */
import { Menu, Sun, Moon, Monitor } from 'lucide-react';
import { NotificationPanel } from './NotificationPanel';
import { useThemeStore } from '../../stores';

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();

  const themes = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;

  const currentIndex = themes.findIndex((t) => t.value === theme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];
  const CurrentIcon = themes[currentIndex]?.icon || Sun;

  return (
    <button
      onClick={() => setTheme(nextTheme.value)}
      className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
      title={`Theme: ${theme} (click for ${nextTheme.label})`}
    >
      <CurrentIcon className="w-5 h-5" />
    </button>
  );
}

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 sticky top-0 z-30">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 -ml-2 mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:hidden rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        </div>

        <div className="flex items-center space-x-1">
          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <NotificationPanel />
        </div>
      </div>
    </header>
  );
}
