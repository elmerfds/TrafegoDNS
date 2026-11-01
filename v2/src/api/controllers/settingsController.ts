/**
 * Settings Controller
 * Manages application settings via API
 */
import type { Request, Response } from 'express';
import { getSettingsService, SETTINGS_SCHEMA } from '../../services/index.js';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { z } from 'zod';

const updateSettingSchema = z.object({
  value: z.string(),
});

const bulkSettingsSchema = z.record(z.string(), z.string());

/**
 * Get settings schema (what settings are available)
 */
export const getSettingsSchema = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: SETTINGS_SCHEMA,
  });
});

/**
 * List all settings with current values
 */
export const listSettings = asyncHandler(async (req: Request, res: Response) => {
  const settingsService = getSettingsService();
  const { category } = req.query;

  if (category && typeof category === 'string') {
    const settingsByCategory = settingsService.getSettingsByCategory();
    const categorySettings = settingsByCategory[category];

    if (!categorySettings) {
      throw ApiError.notFound('Category');
    }

    res.json({
      success: true,
      data: categorySettings,
    });
    return;
  }

  const allSettings = settingsService.getAllSettings();

  res.json({
    success: true,
    data: allSettings,
  });
});

/**
 * Get settings grouped by category
 */
export const getSettingsByCategory = asyncHandler(async (req: Request, res: Response) => {
  const settingsService = getSettingsService();
  const settingsByCategory = settingsService.getSettingsByCategory();

  res.json({
    success: true,
    data: settingsByCategory,
  });
});

/**
 * Get a single setting
 */
export const getSetting = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const settingsService = getSettingsService();

  const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
  if (!definition) {
    throw ApiError.notFound('Setting');
  }

  const value = settingsService.getRaw(key);
  const allSettings = settingsService.getAllSettings();
  const settingWithMeta = allSettings.find((s) => s.key === key);

  res.json({
    success: true,
    data: settingWithMeta ?? {
      ...definition,
      value,
      source: 'default',
    },
  });
});

/**
 * Update a setting
 */
export const updateSetting = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const input = updateSettingSchema.parse(req.body);
  const settingsService = getSettingsService();

  const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
  if (!definition) {
    throw ApiError.notFound('Setting');
  }

  try {
    const result = await settingsService.set(key, input.value);

    setAuditContext(req, {
      action: 'update',
      resourceType: 'setting',
      resourceId: key,
      details: { value: input.value, restartRequired: result.restartRequired },
    });

    res.json({
      success: true,
      data: {
        key,
        value: input.value,
        restartRequired: result.restartRequired,
      },
      message: result.restartRequired
        ? 'Setting updated. Restart required for changes to take effect.'
        : 'Setting updated and applied.',
    });
  } catch (error) {
    if (error instanceof Error) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
});

/**
 * Update multiple settings at once
 */
export const updateBulkSettings = asyncHandler(async (req: Request, res: Response) => {
  const input = bulkSettingsSchema.parse(req.body);
  const settingsService = getSettingsService();

  const results: Array<{ key: string; restartRequired: boolean }> = [];
  const errors: Array<{ key: string; error: string }> = [];

  for (const [key, value] of Object.entries(input)) {
    try {
      const result = await settingsService.set(key, value);
      results.push({ key, restartRequired: result.restartRequired });
    } catch (error) {
      errors.push({
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const restartRequired = results.some((r) => r.restartRequired);

  setAuditContext(req, {
    action: 'update',
    resourceType: 'settings',
    details: { keys: Object.keys(input), restartRequired },
  });

  res.json({
    success: errors.length === 0,
    data: {
      updated: results,
      errors,
      restartRequired,
    },
    message:
      errors.length > 0
        ? `${results.length} settings updated, ${errors.length} failed`
        : restartRequired
          ? `${results.length} settings updated. Restart required for some changes.`
          : `${results.length} settings updated and applied.`,
  });
});

/**
 * Reset a setting to default
 */
export const resetSetting = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key as string;
  const settingsService = getSettingsService();

  const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
  if (!definition) {
    throw ApiError.notFound('Setting');
  }

  await settingsService.reset(key);

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'setting',
    resourceId: key,
    details: { resetToDefault: true },
  });

  res.json({
    success: true,
    data: {
      key,
      value: definition.default,
      restartRequired: definition.restartRequired,
    },
    message: definition.restartRequired
      ? 'Setting reset to default. Restart required for changes to take effect.'
      : 'Setting reset to default.',
  });
});

/**
 * Delete a setting (alias for reset)
 */
export const deleteSetting = resetSetting;
