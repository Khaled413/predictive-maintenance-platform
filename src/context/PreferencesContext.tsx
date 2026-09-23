import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'en' | 'ar'
export type ThemeMode = 'dark' | 'light'
type TranslationKey = string

interface PreferencesContextValue {
  language: Language
  theme: ThemeMode
  toggleLanguage: () => void
  toggleTheme: () => void
  setLanguage: (language: Language) => void
  setTheme: (theme: ThemeMode) => void
  t: (key: TranslationKey) => string
}

const translations: Record<string, string> = {
  Overview: 'نظرة عامة', Machines: 'الآلات', Maintenance: 'الصيانة', 'Quality Inspection': 'فحص الجودة',
  'AI Assistant': 'المساعد الذكي', Alerts: 'التنبيهات', Reports: 'التقارير', Settings: 'الإعدادات',
  Main: 'الرئيسية', 'Last Updated': 'آخر تحديث', 'Factory Status': 'حالة المصنع',
  Operational: 'يعمل بشكل طبيعي', Warning: 'تحذير', Critical: 'حرج', 'Machine Profile': 'ملف الآلة',
  'Switch to light mode': 'التبديل إلى الوضع الفاتح', 'Switch to dark mode': 'التبديل إلى الوضع الداكن',
  'Switch to Arabic': 'التبديل إلى العربية', 'Switch to English': 'التبديل إلى الإنجليزية',
  General: 'عام', Thresholds: 'الحدود', Notifications: 'الإشعارات', 'Data Management': 'إدارة البيانات',
  'AI Configuration': 'إعدادات الذكاء الاصطناعي', Save: 'حفظ', 'Close menu': 'إغلاق القائمة',
  'Open menu': 'فتح القائمة', 'Open alerts': 'فتح التنبيهات', Dismiss: 'إغلاق',
  'Factory profile & units': 'بيانات المصنع والوحدات', 'Health & risk limits': 'حدود الصحة والمخاطر',
  'Alert routing': 'توجيه التنبيهات', 'Retention & reset': 'الاحتفاظ وإعادة الضبط',
  'Model & assistant': 'النموذج والمساعد',
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem('iap-language') as Language | null
    if (stored === 'ar' || stored === 'en') return stored
  } catch {
    // ignore storage issues
  }
  return 'en'
}

function getInitialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('iap-theme') as ThemeMode | null
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // ignore storage issues
  }
  return 'dark'
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('iap-language', language)
  }, [language])

  useEffect(() => {
    document.body.classList.toggle('light-mode', theme === 'light')
    document.body.classList.toggle('dark-mode', theme === 'dark')
    localStorage.setItem('iap-theme', theme)
  }, [theme])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      theme,
      toggleLanguage: () => setLanguageState((current) => (current === 'en' ? 'ar' : 'en')),
      toggleTheme: () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
      setLanguage: (next) => setLanguageState(next),
      setTheme: (next) => setThemeState(next),
      t: (key) => language === 'ar' ? translations[key] ?? key : key,
    }),
    [language, theme],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}
