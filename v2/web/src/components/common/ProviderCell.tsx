/**
 * ProviderCell Component
 * Enhanced provider display for tables showing icon + zone + provider name
 */
import { ProviderIcon } from './ProviderIcon';

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  settings?: {
    zone?: string;
    domain?: string;
    zoneName?: string;
  };
}

interface ProviderCellProps {
  provider: ProviderInfo | null | undefined;
  density?: 'compact' | 'normal' | 'comfortable';
}

export function ProviderCell({ provider, density = 'normal' }: ProviderCellProps) {
  if (!provider) {
    return (
      <span className="text-gray-400 dark:text-gray-500 italic text-xs">
        Unknown
      </span>
    );
  }

  // Extract zone from various possible settings locations
  const zone = provider.settings?.zone
    || provider.settings?.domain
    || provider.settings?.zoneName
    || null;

  if (density === 'compact') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <ProviderIcon type={provider.type} className="w-4 h-4 flex-shrink-0" />
        <span className="truncate text-gray-700 dark:text-gray-300 text-xs">
          {provider.name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ProviderIcon type={provider.type} className="w-5 h-5" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {zone && (
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {zone}
          </div>
        )}
        <div className={`text-gray-500 dark:text-gray-400 truncate ${zone ? 'text-xs' : 'text-sm'}`}>
          {provider.name}
        </div>
      </div>
    </div>
  );
}

export default ProviderCell;
