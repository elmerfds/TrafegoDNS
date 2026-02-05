/**
 * Spotlight Context
 * Manages spotlight highlighting state for the command palette
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SpotlightContextValue {
  /** Current element ID being spotlighted */
  spotlightId: string | null;
  /** Set the spotlight to a specific element */
  setSpotlight: (id: string | null) => void;
  /** Clear the spotlight */
  clearSpotlight: () => void;
  /** Optional settings tab to activate */
  settingsTab: string | null;
  /** Set the settings tab to activate */
  setSettingsTab: (tab: string | null) => void;
}

const SpotlightContext = createContext<SpotlightContextValue | null>(null);

interface SpotlightProviderProps {
  children: ReactNode;
}

export function SpotlightProvider({ children }: SpotlightProviderProps) {
  const [spotlightId, setSpotlightIdState] = useState<string | null>(null);
  const [settingsTab, setSettingsTabState] = useState<string | null>(null);

  const setSpotlight = useCallback((id: string | null) => {
    setSpotlightIdState(id);
  }, []);

  const clearSpotlight = useCallback(() => {
    setSpotlightIdState(null);
    setSettingsTabState(null);
  }, []);

  const setSettingsTab = useCallback((tab: string | null) => {
    setSettingsTabState(tab);
  }, []);

  return (
    <SpotlightContext.Provider
      value={{
        spotlightId,
        setSpotlight,
        clearSpotlight,
        settingsTab,
        setSettingsTab,
      }}
    >
      {children}
    </SpotlightContext.Provider>
  );
}

export function useSpotlightContext(): SpotlightContextValue {
  const context = useContext(SpotlightContext);
  if (!context) {
    throw new Error('useSpotlightContext must be used within a SpotlightProvider');
  }
  return context;
}
