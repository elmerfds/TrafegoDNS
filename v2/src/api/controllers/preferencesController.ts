/**
 * Preferences Controller
 * Manages user-specific preferences via API
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../../database/connection.js';
import { userPreferences } from '../../database/schema/index.js';
import { ApiError, asyncHandler } from '../middleware/index.js';
import { z } from 'zod';
import { isSyntheticUserId } from '../../core/syntheticUsers.js';

const updatePreferenceSchema = z.object({
  value: z.unknown(), // Accept any JSON-serializable value
});

/**
 * List all preferences for the current user
 */
export const listPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const db = getDatabase();
  const preferences = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, req.user.id));

  // Parse JSON values
  const parsed = preferences.map((pref) => ({
    key: pref.preferenceKey,
    value: JSON.parse(pref.value),
    updatedAt: pref.updatedAt,
  }));

  res.json({
    success: true,
    data: parsed,
  });
});

/**
 * Get a specific preference
 */
export const getPreference = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const key = req.params.key as string;
  const db = getDatabase();

  const [preference] = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, req.user.id),
        eq(userPreferences.preferenceKey, key)
      )
    )
    .limit(1);

  if (!preference) {
    // Return null for non-existent preferences (not an error)
    res.json({
      success: true,
      data: null,
    });
    return;
  }

  res.json({
    success: true,
    data: {
      key: preference.preferenceKey,
      value: JSON.parse(preference.value),
      updatedAt: preference.updatedAt,
    },
  });
});

/**
 * Create or update a preference
 */
export const updatePreference = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const key = req.params.key as string;
  const parsed = updatePreferenceSchema.parse(req.body);
  const valueJson = JSON.stringify(parsed.value);

  // Synthetic principals (auth disabled, global API key) have no user row,
  // so preferences can't be stored; accept and echo without persisting.
  if (isSyntheticUserId(req.user.id)) {
    res.json({ success: true, data: { key, value: parsed.value, persisted: false } });
    return;
  }

  const db = getDatabase();
  const now = new Date();

  // Check if preference exists
  const [existing] = await db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, req.user.id),
        eq(userPreferences.preferenceKey, key)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing
    await db
      .update(userPreferences)
      .set({
        value: valueJson,
        updatedAt: now,
      })
      .where(eq(userPreferences.id, existing.id));
  } else {
    // Create new
    await db.insert(userPreferences).values({
      id: uuidv4(),
      userId: req.user.id,
      preferenceKey: key,
      value: valueJson,
      createdAt: now,
      updatedAt: now,
    });
  }

  res.json({
    success: true,
    data: {
      key,
      value: parsed.value,
      updatedAt: now,
    },
  });
});

/**
 * Delete a preference (reset to default)
 */
export const deletePreference = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const key = req.params.key as string;
  const db = getDatabase();

  await db
    .delete(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, req.user.id),
        eq(userPreferences.preferenceKey, key)
      )
    );

  res.json({
    success: true,
    message: 'Preference deleted',
  });
});
