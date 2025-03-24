// src/contexts/SettingsContext.js
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
      // Fetch all settings and data in parallel
      const [settingsResponse, modeResponse] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getOperationMode()
      ]);

      // Use the enhanced method to get detailed provider configs
      const providersData = await providersService.fetchAllProviderConfigs();

      setSettings(settingsResponse.data);
      setOperationMode(modeResponse.data);
      setProviders(providersData);

      // Check for environment variables for each provider
      if (providersData.available && providersData.available.length > 0) {
        const envStatuses = await Promise.all(
          providersData.available.map(async provider => {
            const isFromEnv = await providersService.checkEnvironmentConfig(provider);
            return { provider, isFromEnv };
          })
        );

        // Mark providers configured via environment variables
        const updatedConfigs = { ...providersData.configs };
        
        envStatuses.forEach(({ provider, isFromEnv }) => {
          if (isFromEnv && updatedConfigs[provider]) {
            // Process config to mark env variables
            updatedConfigs[provider] = providersService.processProviderConfig(
              provider,
              updatedConfigs[provider],
              true
            );
          }
        });

        // Update providers with environment variable information
        setProviders(prev => ({
          ...prev,
          configs: updatedConfigs
        }));
      }
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
      // Don't allow updating environment variable configs
      const updatedConfig = { ...config };
      const existingConfig = providers.configs[provider] || {};
      
      // Check for environment variables
      Object.keys(updatedConfig).forEach(key => {
        if (existingConfig[key] === 'CONFIGURED_FROM_ENV') {
          delete updatedConfig[key]; // Remove fields configured by env vars
          console.warn(`Skipping update for ${provider}.${key} which is set by environment variable`);
        }
      });
      
      // If there's nothing left to update, don't make the API call
      if (Object.keys(updatedConfig).length === 0) {
        toast.info('No changes to save - fields are configured via environment variables');
        return true;
      }
      
      // Update via API
      await providersService.updateProviderConfig(provider, updatedConfig);
      
      // Update the local state
      setProviders(prev => {
        const newConfigs = { ...prev.configs };
        
        // Create provider config object if it doesn't exist
        if (!newConfigs[provider]) {
          newConfigs[provider] = {};
        }
        
        // Update each field, preserving environment variable configs
        Object.keys(updatedConfig).forEach(key => {
          // Only update if it's not from an environment variable
          if (newConfigs[provider][key] !== 'CONFIGURED_FROM_ENV') {
            if (providersService.isMaskedValue(updatedConfig[key])) {
              newConfigs[provider][key] = 'CONFIGURED';
            } else {
              newConfigs[provider][key] = updatedConfig[key];
            }
          }
        });
        
        return {
          ...prev,
          configs: newConfigs
        };
      });
      
      toast.success(`Updated ${provider} configuration`);
      return true;
    } catch (error) {
      console.error('Error updating provider config:', error);
      toast.error('Failed to update provider configuration');
      return false;
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

export default SettingsContext;