import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';
import settingsService from '../services/settingsService';
import providersService from '../services/providersService';
import { useAuth } from './AuthContext';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState({
    current: '',
    available: [],
    configs: {}
  });
  const [operationMode, setOperationMode] = useState({
    current: '',
    available: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only fetch settings when user is authenticated
    if (currentUser) {
      fetchAllSettings();
    } else {
      setIsLoading(false);
    }
  }, [currentUser]);

  const fetchAllSettings = async () => {
    setIsLoading(true);
    try {
      // Fetch settings, providers, and mode in parallel
      const [settingsResponse, providersResponse, modeResponse] = await Promise.all([
        settingsService.getSettings(),
        providersService.getAllProviders(),
        settingsService.getOperationMode()
      ]);

      setSettings(settingsResponse.data);
      setProviders(providersResponse.data);
      setOperationMode(modeResponse.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      const response = await settingsService.updateSettings(newSettings);
      setSettings(response.data.settings);
      toast.success('Settings updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to update settings');
      return false;
    }
  };

  const resetSettings = async () => {
    try {
      const response = await settingsService.resetSettings();
      setSettings(response.data.settings);
      toast.success('Settings reset to defaults');
      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      toast.error('Failed to reset settings');
      return false;
    }
  };

  const switchProvider = async (provider) => {
    try {
      const response = await providersService.switchProvider(provider);
      setProviders({
        ...providers,
        current: response.data.current
      });
      toast.success(`Switched to ${provider} provider`);
      return true;
    } catch (error) {
      console.error('Error switching provider:', error);
      toast.error('Failed to switch provider');
      return false;
    }
  };

  const updateProviderConfig = async (provider, config) => {
    try {
      // Call the API to update the provider config
      await providersService.updateProviderConfig(provider, config);
      
      // Update the local state with the new config
      setProviders(prevProviders => ({
        ...prevProviders,
        configs: {
          ...prevProviders.configs,
          [provider]: config
        }
      }));
      
      // Save to localStorage for persistence (optional)
      try {
        const storedSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        localStorage.setItem('appSettings', JSON.stringify({
          ...storedSettings,
          providers: {
            ...storedSettings.providers,
            configs: {
              ...(storedSettings.providers?.configs || {}),
              [provider]: config
            }
          }
        }));
      } catch (storageError) {
        console.error('Error saving provider config to localStorage:', storageError);
      }
      
      toast.success(`Updated ${provider} configuration`);
      return true;
    } catch (error) {
      console.error('Error updating provider config:', error);
      toast.error('Failed to update provider configuration');
      return false;
    }
  };
  
  // Fetch provider configurations during initialization
  const fetchProviderConfigs = async () => {
    try {
      const providers = await providersService.getAllProviders();
      
      // Store the provider configs centrally
      setProviders(providers.data);
      
      // Also store in localStorage for persistence between sessions
      try {
        const storedSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        localStorage.setItem('appSettings', JSON.stringify({
          ...storedSettings,
          providers: providers.data
        }));
      } catch (storageError) {
        console.error('Error saving provider configs to localStorage:', storageError);
      }
      
      return providers.data;
    } catch (error) {
      console.error('Error fetching provider configs:', error);
      return null;
    }
  };

  const switchOperationMode = async (mode) => {
    try {
      const response = await settingsService.switchOperationMode(mode);
      setOperationMode({
        current: response.data.current,
        available: response.data.available
      });
      toast.success(`Switched to ${mode} operation mode`);
      return true;
    } catch (error) {
      console.error('Error switching operation mode:', error);
      toast.error('Failed to switch operation mode');
      return false;
    }
  };

  const value = {
    settings,
    providers,
    operationMode,
    isLoading,
    fetchAllSettings,
    updateSettings,
    resetSettings,
    switchProvider,
    updateProviderConfig,
    switchOperationMode
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};