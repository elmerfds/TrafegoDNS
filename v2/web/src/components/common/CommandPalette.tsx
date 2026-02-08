/**
 * Command Palette Component
 * Global search and navigation command palette (Cmd/Ctrl+K)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Command,
  LayoutDashboard,
  Globe,
  Server,
  Cable,
  Webhook,
  Settings,
  Users,
  FileText,
  BookOpen,
  RefreshCw,
  Plus,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  SEARCH_REGISTRY,
  CATEGORY_CONFIG,
  searchItems,
  groupByCategory,
  type SearchableItem,
} from '../../config/searchRegistry';
import { useSpotlightContext } from '../../contexts/SpotlightContext';
import { useAuthStore } from '../../stores/authStore';
import { dnsApi } from '../../api';

// Icon mapping
const ICONS: Record<string, React.ElementType> = {
  LayoutDashboard,
  Globe,
  Server,
  Cable,
  Webhook,
  Settings,
  Users,
  FileText,
  BookOpen,
  RefreshCw,
  Plus,
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { setSpotlight, setSettingsTab } = useSpotlightContext();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce the query for API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Query DNS records dynamically when query is 2+ characters
  const { data: dnsResults, isLoading: isDnsLoading } = useQuery({
    queryKey: ['dns-palette-search', debouncedQuery],
    queryFn: () => dnsApi.listRecords({ search: debouncedQuery, limit: 6 }),
    enabled: isOpen && debouncedQuery.length >= 2,
    staleTime: 1000 * 30, // Cache for 30 seconds
  });

  // Transform DNS records to SearchableItem format
  const dynamicDnsItems: SearchableItem[] = useMemo(() => {
    if (!dnsResults?.records) return [];
    return dnsResults.records.map((record) => ({
      id: `dns-record-${record.id}`,
      label: record.hostname,
      description: `${record.type} → ${record.content.length > 30 ? record.content.slice(0, 30) + '...' : record.content}`,
      category: 'dns' as const,
      route: `/dns?search=${encodeURIComponent(record.hostname)}`,
      icon: 'Globe',
    }));
  }, [dnsResults]);

  // Search static results
  const staticResults = useMemo(() => {
    if (!query.trim()) {
      // Show navigation items by default when no query
      return SEARCH_REGISTRY.filter(
        (item) => item.category === 'navigation' && (!item.adminOnly || isAdmin)
      );
    }
    return searchItems(query, SEARCH_REGISTRY, isAdmin);
  }, [query, isAdmin]);

  // Combine static and dynamic results
  const results = useMemo(() => {
    // If we have dynamic DNS results, add them
    if (dynamicDnsItems.length > 0) {
      // Filter out any DNS records that might match static items
      const combined = [...staticResults, ...dynamicDnsItems];
      return combined;
    }
    return staticResults;
  }, [staticResults, dynamicDnsItems]);

  // Group results by category
  const groupedResults = useMemo(() => groupByCategory(results), [results]);

  // Flatten grouped results for keyboard navigation
  const flatResults = useMemo(() => {
    const flat: SearchableItem[] = [];
    for (const items of groupedResults.values()) {
      flat.push(...items);
    }
    return flat;
  }, [groupedResults]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after a small delay
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (flatResults[selectedIndex]) {
            handleSelect(flatResults[selectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, flatResults, selectedIndex, onClose]
  );

  // Register keyboard handler
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatResults[selectedIndex]) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatResults]);

  // Handle item selection
  const handleSelect = (item: SearchableItem) => {
    // Set spotlight if element ID is specified
    if (item.elementId) {
      setSpotlight(item.elementId);
    }

    // Set settings tab if specified
    if (item.settingsTab) {
      setSettingsTab(item.settingsTab);
    }

    // Navigate to route
    navigate({ to: item.route });

    // Close palette
    onClose();
  };

  // Get icon component
  const getIcon = (iconName?: string) => {
    if (!iconName) return null;
    const IconComponent = ICONS[iconName];
    return IconComponent ? <IconComponent className="w-4 h-4" /> : null;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50">
        <div className="mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            {isDnsLoading ? (
              <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
            ) : (
              <Search className="w-5 h-5 text-gray-400" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search pages, settings, DNS records..."
              className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none text-sm"
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
              <Command className="w-3 h-3" />K
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-80 overflow-y-auto py-2"
          >
            {flatResults.length === 0 && !isDnsLoading ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No results found for "{query}"</p>
              </div>
            ) : flatResults.length === 0 && isDnsLoading ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">Searching DNS records...</p>
              </div>
            ) : (
              Array.from(groupedResults.entries()).map(([category, items]) => (
                <div key={category} className="mb-2">
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {CATEGORY_CONFIG[category].label}
                  </div>
                  {items.map((item) => {
                    const itemIndex = flatResults.indexOf(item);
                    const isSelected = itemIndex === selectedIndex;

                    return (
                      <button
                        key={item.id}
                        data-index={itemIndex}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 ${
                            isSelected
                              ? 'text-primary-500'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {getIcon(item.icon) || <ArrowRight className="w-4 h-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.label}
                          </div>
                          {item.description && (
                            <div
                              className={`text-xs truncate ${
                                isSelected
                                  ? 'text-primary-500/70 dark:text-primary-400/70'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}
                            >
                              {item.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="flex-shrink-0 text-xs text-primary-500">
                            ↵
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↓</kbd>
                <span className="ml-1">Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">↵</kbd>
                <span className="ml-1">Select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd>
                <span className="ml-1">Close</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
