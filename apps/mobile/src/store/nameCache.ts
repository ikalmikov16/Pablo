/**
 * Local cache of the last display name the player typed, so the name field
 * pre-fills across the create / join / lobby screens. The profile row is the
 * network source of truth; this is just a convenience mirror on-device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pablo.displayName';

export async function loadCachedName(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function saveCachedName(name: string): Promise<void> {
  const trimmed = name.trim();
  try {
    if (trimmed.length > 0) await AsyncStorage.setItem(STORAGE_KEY, trimmed);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cache; failures are non-fatal (the profile row still persists).
  }
}
