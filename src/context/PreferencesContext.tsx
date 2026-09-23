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
  'Industrial AI Platform': 'منصة الذكاء الاصطناعي الصناعية',
  'Machine Health & Maintenance': 'صحة الآلات والصيانة',
  'Smart Maintenance for Higher Productivity': 'صيانة ذكية لإنتاجية أعلى',
  'Predict · Prevent · Optimize': 'تنبأ · امنع · حسّن',
  'Real-time fleet health and predictive maintenance summary': 'ملخص لحظي لصحة الأسطول والصيانة التنبؤية',
  'Manage your equipment fleet and sensor configurations': 'إدارة معدات المصنع وإعدادات المستشعرات',
  'Plan, track and complete maintenance work orders': 'تخطيط وتتبع وإنجاز أوامر الصيانة',
  'Automated visual inspection with defect detection': 'فحص بصري آلي لاكتشاف العيوب',
  'Actionable alerts across machines, maintenance and quality': 'تنبيهات قابلة للتنفيذ عبر الآلات والصيانة والجودة',
  'Performance, reliability and quality analytics': 'تحليلات الأداء والموثوقية والجودة',
  'Configure platform thresholds, notifications and AI behavior': 'تهيئة حدود المنصة والإشعارات وسلوك الذكاء الاصطناعي',
  'Total Machines': 'إجمالي الآلات', 'Machines at Risk': 'الآلات المعرضة للخطر',
  'Upcoming Maintenance': 'الصيانة القادمة', 'Avg. Health Score': 'متوسط درجة الصحة',
  'Total Downtime (7d)': 'إجمالي التوقف (7 أيام)', 'Registered equipment': 'المعدات المسجلة',
  'Next 14 days': 'الأيام الـ14 القادمة', 'Fleet healthy': 'الأسطول بحالة جيدة',
  'Monitor closely': 'تحتاج إلى متابعة', 'Maintenance + failures': 'الصيانة والأعطال',
  'Search by Machine ID, name or type…': 'ابحث برقم الآلة أو الاسم أو النوع…',
  'Machine Type: All': 'نوع الآلة: الكل', 'Status: All': 'الحالة: الكل',
  'No machines match your filters': 'لا توجد آلات مطابقة للفلاتر',
  'Try adjusting the machine type, status or search query.': 'جرّب تعديل نوع الآلة أو الحالة أو عبارة البحث.',
  'No machines match': 'لا توجد آلات مطابقة',
  'Adjust the machine filter to see the analytics table.': 'عدّل فلتر الآلات لعرض جدول التحليلات.',
  'Upcoming': 'القادمة', Scheduled: 'مجدولة', 'In Progress': 'قيد التنفيذ',
  Completed: 'مكتملة', History: 'السجل', 'All Analytics': 'كل التحليلات',
  'Machine Health': 'صحة الآلات', 'Failure Risk': 'خطر الأعطال', Downtime: 'التوقف',
  Quality: 'الجودة', 'Last 7 Days': 'آخر 7 أيام', 'Last 30 Days': 'آخر 30 يومًا',
  'Last 3 Months': 'آخر 3 أشهر', 'Custom Range': 'نطاق مخصص',
  'Search by machine, type, reason or technician…': 'ابحث بالآلة أو النوع أو السبب أو الفني…',
  'Type / Reason': 'النوع / السبب', Priority: 'الأولوية', Technician: 'الفني',
  Cost: 'التكلفة', Actions: 'الإجراءات', 'Start work': 'بدء العمل', 'Edit record': 'تعديل السجل',
  'Product Image Inspection': 'فحص صورة المنتج', 'Inspection Result': 'نتيجة الفحص',
  'No inspection yet': 'لم يتم إجراء فحص بعد', 'Defects by Type': 'العيوب حسب النوع',
  'Distribution of detected defect classes': 'توزيع فئات العيوب المكتشفة',
  'Result: All': 'النتيجة: الكل', 'Defect: All': 'العيب: الكل', Image: 'الصورة',
  Product: 'المنتج', Result: 'النتيجة', 'Defect Type': 'نوع العيب', Location: 'الموقع',
  'Average Health Score': 'متوسط درجة الصحة',
  'Machines grouped by predicted 7-day failure probability': 'الآلات مجمعة حسب احتمال العطل المتوقع خلال 7 أيام',
  'No downtime recorded': 'لا يوجد توقف مسجل', 'Maintenance Cost': 'تكلفة الصيانة',
  'Spend against completed work orders': 'الإنفاق مقابل أوامر العمل المكتملة',
  'Quality Rate': 'معدل الجودة', 'Pass vs. defect rate per inspection batch': 'معدل النجاح مقابل العيوب لكل دفعة فحص',
  'No defects detected': 'لم يتم اكتشاف عيوب', 'All inspections in this window passed.': 'اجتازت جميع الفحوصات في هذه الفترة.',
  'Machine Health Analytics': 'تحليلات صحة الآلات', Health: 'الصحة',
  'Ask AI About': 'اسأل الذكاء الاصطناعي عن', 'Scope the assistant’s context': 'حدد نطاق سياق المساعد',
  "Scope the assistant's context": 'حدد نطاق سياق المساعد',
  'Conversations': 'المحادثات', 'Ask about your machines, maintenance and documents': 'اسأل عن آلاتك وصيانتك ومستنداتك',
  'Ask about machines, maintenance, documents…': 'اسأل عن الآلات والصيانة والمستندات…',
  'Entire Factory': 'المصنع بالكامل', 'Specific Machine': 'آلة محددة', 'Knowledge Base': 'قاعدة المعرفة',
  'Uploaded Document': 'مستند مرفوع', 'Answers across the whole fleet': 'إجابات حول الأسطول بالكامل',
  'Answers scoped to one machine': 'إجابات مخصصة لآلة واحدة', 'Answers grounded in documents': 'إجابات مستندة إلى المستندات',
  'Answers from a single file': 'إجابات من ملف واحد', 'Send message': 'إرسال الرسالة',
  'Explainable AI': 'ذكاء اصطناعي قابل للتفسير', 'No alerts in this view': 'لا توجد تنبيهات في هذا العرض',
  'Hide resolved alerts': 'إخفاء التنبيهات المحلولة', 'Recommended action: ': 'الإجراء المقترح: ',
  'Factory profile, locale and display preferences': 'بيانات المصنع والمنطقة وتفضيلات العرض',
  'Measurement Units': 'وحدات القياس', 'Shift Pattern': 'نظام الورديات',
  'Health Score — Warning': 'درجة الصحة — تحذير', Current: 'الحالي', 'Reset demo data': 'إعادة ضبط البيانات التجريبية',
  'Clear local cache?': 'مسح الذاكرة المحلية؟', 'Loading page…': 'جارٍ تحميل الصفحة…',
  Temperature: 'درجة الحرارة', Vibration: 'الاهتزاز', Pressure: 'الضغط', Power: 'الطاقة',
  Speed: 'السرعة', Torque: 'العزم', Position: 'الموضع', Flow: 'التدفق', Humidity: 'الرطوبة', Level: 'المستوى',
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

  useEffect(() => {
    const originalText = new WeakMap<Text, string>()
    const originalAttributes = new WeakMap<Element, Map<string, string>>()
    const attributes = ['aria-label', 'title', 'placeholder']
    let scanning = false

    const translate = () => {
      if (scanning) return
      scanning = true
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const textNodes: Text[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const parent = node.parentElement
        if (parent && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) {
          textNodes.push(node as Text)
        }
      }
      textNodes.forEach((textNode) => {
        const source = originalText.get(textNode) ?? textNode.nodeValue ?? ''
        originalText.set(textNode, source)
        const trimmed = source.trim()
        if (!trimmed) return
        const translated = translations[trimmed]
        if (translated && language === 'ar') {
          textNode.nodeValue = source.replace(trimmed, translated)
        } else if (language === 'en') {
          textNode.nodeValue = source
        }
      })
      document.querySelectorAll<HTMLElement>('*').forEach((element) => {
        if (!originalAttributes.has(element)) originalAttributes.set(element, new Map())
        const stored = originalAttributes.get(element)!
        attributes.forEach((attribute) => {
          const value = element.getAttribute(attribute)
          if (value === null) return
          const source = stored.get(attribute) ?? value
          stored.set(attribute, source)
          const translated = translations[source]
          element.setAttribute(attribute, language === 'ar' && translated ? translated : source)
        })
      })
      scanning = false
    }

    translate()
    const observer = new MutationObserver(translate)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true })
    return () => observer.disconnect()
  }, [language])

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
