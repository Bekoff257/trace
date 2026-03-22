import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import en from './locales/en';
import ru from './locales/ru';
import uz from './locales/uz';

export type Language = 'en' | 'ru' | 'uz';

export const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English',    nativeLabel: 'English'  },
  { code: 'ru', label: 'Russian',    nativeLabel: 'Русский'  },
  { code: 'uz', label: 'Uzbek',      nativeLabel: 'O\'zbek'  },
];

const STORAGE_KEY = '@trace_language';

function getDeviceLanguage(): Language {
  const tag = Localization.getLocales()[0]?.languageTag ?? 'en';
  if (tag.startsWith('ru')) return 'ru';
  if (tag.startsWith('uz')) return 'uz';
  return 'en';
}

export async function initI18n(): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  const lang = (stored as Language | null) ?? getDeviceLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, ru: { translation: ru }, uz: { translation: uz } },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
    });
}

export async function changeLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
}

export function getCurrentLanguage(): Language {
  return (i18n.language as Language) ?? 'en';
}

export default i18n;
