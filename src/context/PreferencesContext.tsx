import { translations } from '../i18n/translations'
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

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

// Build reverse dictionary (Arabic -> English) for clean bi-directional switching
const reverseTranslations: Record<string, string> = {}
for (const [en, ar] of Object.entries(translations)) {
  if (ar && typeof ar === 'string') {
    reverseTranslations[ar.trim()] = en.trim()
  }
}

function localizeText(value: string, language: Language): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  if (/^[\w .-]+\.(?:pdf|docx|txt|csv|xlsx)$/i.test(trimmed)) return value

  if (language === 'ar') {
    if (trimmed === 'Min') return value.replace(trimmed, 'الحد الأدنى')

    const exact = translations[trimmed]
    if (exact) return value.replace(trimmed, exact)

    const relativeTime = trimmed.match(/^(\d+)(s|m|h|d|mo) ago$/)
    if (relativeTime) {
      const unit: Record<string, string> = {
        s: 'ثانية',
        m: 'دقيقة',
        h: 'ساعة',
        d: 'يوم',
        mo: 'شهر',
      }
      return value.replace(trimmed, `${relativeTime[1]} ${unit[relativeTime[2]]} مضت`)
    }

    const localized = value
      .replace(/\b(\d+(?:[.,]\d+)?)\s*hrs?\b/gi, '$1 ساعة')
      .replace(/\b(\d+(?:[.,]\d+)?)\s*h\b/gi, '$1 ساعة')
      .replace(/\b(\d+(?:[.,]\d+)?)\s*MB\b/gi, '$1 ميجابايت')
      .replace(/\b(\d+)\s+saved\b/gi, '$1 محادثات محفوظة')
      .replace(/\b(\d+(?:[.,]\d+)?)%\s*now\b/gi, '$1% الآن')
    return localized
  } else {
    // English mode: restore English from reverse dictionary
    const exactEn = reverseTranslations[trimmed]
    if (exactEn) return value.replace(trimmed, exactEn)

    const arRelative = trimmed.match(/^(\d+)\s*(ثانية|دقيقة|ساعة|يوم|شهر)\s*مضت$/)
    if (arRelative) {
      const unitEn: Record<string, string> = {
        ثانية: 's',
        دقيقة: 'm',
        ساعة: 'h',
        يوم: 'd',
        شهر: 'mo',
      }
      return value.replace(trimmed, `${arRelative[1]}${unitEn[arRelative[2]] || 'm'} ago`)
    }

    const enText = value
      .replace(/(\d+(?:[.,]\d+)?)\s*ساعة/g, '$1 hrs')
      .replace(/(\d+(?:[.,]\d+)?)\s*ميجابايت/g, '$1 MB')
      .replace(/(\d+)\s*محادثات محفوظة/g, '$1 saved')
      .replace(/(\d+(?:[.,]\d+)?)%\s*الآن/g, '$1% now')
    return enText
  }
}

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
  const originalText = useMemo(() => new WeakMap<Text, string>(), [])
  const renderedText = useMemo(() => new WeakMap<Text, string>(), [])
  const originalAttributes = useMemo(
    () => new WeakMap<Element, Map<string, string>>(),
    []
  )
  const renderedAttributes = useMemo(
    () => new WeakMap<Element, Map<string, string>>(),
    []
  )

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    const title = 'Industrial AI Platform — Machine Health & Maintenance Dashboard'
    document.title = language === 'ar' ? (translations[title] ?? title) : title
    localStorage.setItem('iap-language', language)
  }, [language])

  useEffect(() => {
    document.body.classList.toggle('light-mode', theme === 'light')
    document.body.classList.toggle('dark-mode', theme === 'dark')
    localStorage.setItem('iap-theme', theme)
  }, [theme])

  useEffect(() => {
    const attributes = ['aria-label', 'title', 'placeholder']
    let scanning = false

    const translate = () => {
      if (scanning) return
      scanning = true
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const textNodes: Text[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
          const parent = node.parentElement
          if (
            parent &&
            !parent.closest('code,pre,textarea,input,[data-no-translate],.chat-capsule,[contenteditable]') &&
            !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.tagName)
          ) {
            textNodes.push(node as Text)
          }
        }

        textNodes.forEach((textNode) => {
          const current = textNode.nodeValue ?? ''
          if (!current.trim()) return

          const previousTarget = renderedText.get(textNode)
          let source = originalText.get(textNode)

          if (
            source === undefined ||
            (previousTarget !== undefined && current !== previousTarget)
          ) {
            const trimmed = current.trim()
            if (language === 'ar') {
              // If initialized in Arabic, check if this is an Arabic translation of an English key
              const canonicalEn = reverseTranslations[trimmed]
              source = canonicalEn ? current.replace(trimmed, canonicalEn) : current
            } else {
              source = current
            }
            originalText.set(textNode, source)
          }

          const target = localizeText(source, language)
          renderedText.set(textNode, target)
          if (textNode.nodeValue !== target) {
            textNode.nodeValue = target
          }
        })

        document.querySelectorAll<HTMLElement>('*').forEach((element) => {
          if (!originalAttributes.has(element)) originalAttributes.set(element, new Map())
          const stored = originalAttributes.get(element)!
          if (!renderedAttributes.has(element)) renderedAttributes.set(element, new Map())
          const rendered = renderedAttributes.get(element)!
          attributes.forEach((attribute) => {
            const value = element.getAttribute(attribute)
            if (value === null || !value.trim()) return
            const previousTarget = rendered.get(attribute)
            let source = stored.get(attribute)
            if (
              source === undefined ||
              (previousTarget !== undefined && value !== previousTarget)
            ) {
              const trimmed = value.trim()
              if (language === 'ar') {
                const canonicalEn = reverseTranslations[trimmed]
                source = canonicalEn ? value.replace(trimmed, canonicalEn) : value
              } else {
                source = value
              }
              stored.set(attribute, source)
            }
            const target = localizeText(source, language)
            rendered.set(attribute, target)
            if (value !== target) element.setAttribute(attribute, target)
          })
        })
      } finally {
        scanning = false
      }
    }

    translate()
    const observer = new MutationObserver(translate)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: attributes,
    })
    return () => observer.disconnect()
  }, [language, originalText, renderedText, originalAttributes, renderedAttributes])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      theme,
      toggleLanguage: () =>
        setLanguageState((current) => (current === 'en' ? 'ar' : 'en')),
      toggleTheme: () =>
        setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
      setLanguage: (next) => setLanguageState(next),
      setTheme: (next) => setThemeState(next),
      t: (key) => {
        if (!key) return ''
        const trimmed = key.trim()
        if (language === 'ar') {
          return translations[trimmed] ?? translations[key] ?? key
        } else {
          return reverseTranslations[trimmed] ?? reverseTranslations[key] ?? key
        }
      },
    }),
    [language, theme]
  )

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hooks must ship with their provider in the same module
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}

