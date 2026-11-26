import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Token and server address. Android/iOS keystore on the phone, localStorage in the browser. */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { try { return localStorage.getItem(key); } catch { return null; } }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { try { localStorage.setItem(key, value); } catch { /* private mode */ } return; }
  try { await SecureStore.setItemAsync(key, value); } catch { /* ignore */ }
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') { try { localStorage.removeItem(key); } catch { /* ignore */ } return; }
  try { await SecureStore.deleteItemAsync(key); } catch { /* ignore */ }
}
