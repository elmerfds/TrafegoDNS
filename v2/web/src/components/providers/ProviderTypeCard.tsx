/**
 * Provider Type Card
 * Visual card for selecting a DNS provider type in the wizard
 */
import { Check } from 'lucide-react';
import { ProviderIcon } from '../common';
import type { ProviderType } from '../../api';

interface ProviderTypeCardProps {
  type: ProviderType;
  name: string;
  description: string;
  supportedTypes: string[];
  features?: string[];
  selected: boolean;
  onClick: () => void;
}

export function ProviderTypeCard({
  type,
  name,
  description,
  supportedTypes,
  features = [],
  selected,
  onClick,
}: ProviderTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-start text-left w-full rounded-xl p-4
        border-2 transition-all duration-200 cursor-pointer
        ${selected
          ? 'border-primary-500 dark:border-primary-400 ring-2 ring-primary-500/20 bg-primary-50/50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md'
        }
      `}
    >
      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Provider icon */}
      <div className="mb-3">
        <ProviderIcon type={type} className="w-10 h-10" />
      </div>

      {/* Name and description */}
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{name}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>

      {/* Record types */}
      <div className="flex flex-wrap gap-1">
        {supportedTypes.map((rt) => (
          <span
            key={rt}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            {rt}
          </span>
        ))}
      </div>

      {/* Feature badges */}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {features.map((feat) => (
            <span
              key={feat}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"
            >
              {feat}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
