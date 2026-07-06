import { load, type Store } from '@tauri-apps/plugin-store';
import type { KeymapOverride } from './keymap';

const STORE_FILE = 'keymap.json';
const KEY = 'overrides';

let store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await load(STORE_FILE);
  }
  return store;
}

export async function loadOverrides(): Promise<KeymapOverride> {
  try {
    const s = await getStore();
    const raw = await s.get<Record<string, unknown>>(KEY);
    if (!raw || typeof raw !== 'object') return {};
    const result: KeymapOverride = {};
    for (const [id, combo] of Object.entries(raw)) {
      if (
        combo &&
        typeof combo === 'object' &&
        typeof (combo as { key: unknown }).key === 'string' &&
        typeof (combo as { mod: unknown }).mod === 'boolean' &&
        typeof (combo as { shift: unknown }).shift === 'boolean' &&
        typeof (combo as { alt: unknown }).alt === 'boolean'
      ) {
        result[id] = combo as KeymapOverride[string];
      }
    }
    return result;
  } catch (e) {
    console.error('Failed to load keymap overrides', e);
    return {};
  }
}

export async function saveOverrides(overrides: KeymapOverride): Promise<void> {
  try {
    const s = await getStore();
    await s.set(KEY, overrides);
    await s.save();
  } catch (e) {
    console.error('Failed to save keymap overrides', e);
  }
}
