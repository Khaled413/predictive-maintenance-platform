import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Database,
  Factory,
  FileText,
  Gauge,
  KeyRound,
  Lock,
  Menu,
  Moon,
  RotateCw,
  Server,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Languages,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import AuthModal from '../components/auth/AuthModal'

const WALKTHROUGH_STEPS = [
  {
    step: 1,
    title: 'Sensor Data Acquisition',
    titleAr: 'جمع بيانات المستشعرات',
    badge: 'IoT Edge Telemetry',
    desc: 'High-frequency vibration, thermal, acoustic, and pressure sensors capture millisecond-level telemetry from rotating equipment.',
    descAr:
      'مستشعرات الاهتزاز والحرارة والضغط تلتقط قياسات لحظية دقيقة من المعدات الدوارة والميكانيكية.',
    metrics: [
      { label: 'Drive Vibration', val: '4.2 mm/s', status: 'Elevated' },
      { label: 'Bearing Temp', val: '78.5 °C', status: 'Warning' },
      { label: 'Torque Load', val: '142 Nm', status: 'Nominal' },
    ],
    stateTone: 'warn',
  },
  {
    step: 2,
    title: 'Stream Processing & Feature Engineering',
    titleAr: 'معالجة البيانات وهندسة الخصائص',
    badge: 'Real-time Pipeline',
    desc: 'Fast Fourier Transform (FFT) spectral extraction, RMS vibration calculations, and thermal gradient transformations prepare clean tensors.',
    descAr:
      'تحويل فورييه السريع (FFT) واستخراج جذر متوسط المربع للترددات وتدرجات الحرارة لتهيئة مصفوفات الإدخال.',
    metrics: [
      { label: 'Sampling Rate', val: '10 kHz', status: 'Sync' },
      { label: 'Spectral Peaks', val: '3 Frequencies', status: 'Extracted' },
      { label: 'Noise Filter', val: '99.4%', status: 'Clean' },
    ],
    stateTone: 'info',
  },
  {
    step: 3,
    title: 'Machine Learning Failure Inference',
    titleAr: 'استدلال الذكاء الاصطناعي بالأعطال',
    badge: 'FastAPI ML Engine',
    desc: 'Trained ensemble models assess multi-modal sensor inputs to detect early micro-anomalies long before mechanical seizure occurs.',
    descAr:
      'نماذج الذكاء الاصطناعي تحلل المدخلات لاكتشاف الشذوذ الميكانيكي الدقيق قبل حدوث التوقف المفاجئ بأسابيع.',
    metrics: [
      { label: 'Inference Latency', val: '42 ms', status: 'Real-time' },
      { label: 'Model Version', val: 'v2.4 Production', status: 'Active' },
      { label: 'Anomaly Flag', val: 'Detected', status: 'Critical' },
    ],
    stateTone: 'danger',
  },
  {
    step: 4,
    title: 'Real-Time Health & Risk Scoring',
    titleAr: 'تقييم الصحة ومستوى المخاطر',
    badge: 'Diagnostic Intelligence',
    desc: 'The machine health score drops from 95% to 34%, classifying Heat Dissipation Failure (HDF) with 66% probability.',
    descAr:
      'انخفاض مؤشر صحة الآلة إلى 34% مع تصنيف عطل تشتيت الحرارة (HDF) باحتمالية 66%.',
    metrics: [
      { label: 'Health Score', val: '34 / 100', status: 'Critical' },
      { label: 'Failure Risk', val: '66.0%', status: 'Severe' },
      { label: 'Predicted Failure', val: 'Heat Dissipation', status: 'HDF' },
    ],
    stateTone: 'danger',
  },
  {
    step: 5,
    title: 'Autonomous Prescriptive Recommendation',
    titleAr: 'التوصيات الوقائية الذكية',
    badge: 'Prescriptive Action',
    desc: 'The platform generates step-by-step root-cause guidance: inspect cooling jacket flow, check coolant pump impeller, and flush heat exchanger.',
    descAr:
      'المنصة تقدم خطوات علاجية محددة: فحص سترة التبريد، واختبار مضخة سائل التبريد، وتنظيف المبادل الحراري.',
    metrics: [
      { label: 'Urgency', val: 'Within 48h', status: 'Immediate' },
      { label: 'Prescribed Action', val: 'Flush Exchanger', status: 'Specific' },
      { label: 'Est. Downtime Saved', val: '14.5 Hours', status: 'High ROI' },
    ],
    stateTone: 'info',
  },
  {
    step: 6,
    title: 'Work Order & Technician Assignment',
    titleAr: 'أمر الصيانة وتعيين الفني',
    badge: 'Operational Dispatch',
    desc: 'Maintenance order MO-005 is dispatched to certified technician Ahmed Hassan based on his Line 2 operational scope.',
    descAr:
      'إصدار أمر العمل MO-005 وإسناده تلقائياً إلى الفني المختص أحمد حسن بناءً على نطاق مسؤوليته في خط 2.',
    metrics: [
      { label: 'Order ID', val: 'MO-M005', status: 'Created' },
      { label: 'Technician', val: 'Ahmed Hassan', status: 'Assigned' },
      { label: 'Priority', val: 'High', status: 'Scheduled' },
    ],
    stateTone: 'info',
  },
  {
    step: 7,
    title: 'Resolution & Operational Restoration',
    titleAr: 'إتمام الصيانة واستعادة الكفاءة',
    badge: 'Closed-Loop Reliability',
    desc: 'Work is marked complete, sensor telemetry normalizes to 95% health, and an immutable record is archived in the audit log.',
    descAr:
      'إتمام الصيانة، وعودة قياسات المستشعرات للمعدل الطبيعي بنسبة 95%، وتوثيق السجل في سجل التدقيق الأمني.',
    metrics: [
      { label: 'Post-Work Health', val: '95 / 100', status: 'Nominal' },
      { label: 'Status', val: 'Operational', status: 'Healthy' },
      { label: 'Audit Trail', val: 'Verified & Logged', status: 'Compliant' },
    ],
    stateTone: 'success',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, signOutUser } = useAuth()
  const { theme, toggleTheme, language, toggleLanguage, t } = usePreferences()

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'reset' | 'request'>(
    'signin'
  )
  const [activeStep, setActiveStep] = useState(0)
  const [activeRoleTab, setActiveRoleTab] = useState<'admin' | 'manager' | 'technician'>(
    'manager'
  )
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const openAuth = (mode: 'signin' | 'reset' | 'request' = 'signin') => {
    setAuthModalMode(mode)
    setAuthModalOpen(true)
    setMobileMenuOpen(false)
  }

  // Open sign in modal if redirected from a protected route
  useEffect(() => {
    if ((location.state as any)?.requireAuth && !currentUser) {
      openAuth('signin')
    }
  }, [location.state, currentUser])

  // Auto-cycle interactive walkthrough gently
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % WALKTHROUGH_STEPS.length)
    }, 6500)
    return () => clearInterval(timer)
  }, [])

  const handleLaunchApp = () => {
    if (currentUser && currentUser.status === 'active') {
      navigate('/app')
    } else {
      openAuth('signin')
    }
  }

  const currentWalkthrough = WALKTHROUGH_STEPS[activeStep]

  return (
    <div className="min-h-screen bg-navy-950 text-ink selection:bg-sky-500/30 selection:text-sky-200">
      {/* Ambient Lighting Orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-cyan-500/10 via-sky-600/5 to-transparent blur-[140px] animate-float" />
        <div className="absolute right-0 top-1/4 h-[550px] w-[550px] rounded-full bg-gradient-to-bl from-indigo-600/10 via-purple-600/5 to-transparent blur-[150px]" />
        <div className="absolute bottom-10 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-teal-500/10 via-emerald-600/5 to-transparent blur-[130px]" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-navy-950/85 backdrop-blur-xl transition-all">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-indigo-600/20 text-sky-400 shadow-[0_0_20px_-3px_rgba(56,189,248,0.35)]">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <span className="font-mono text-sm font-black tracking-wider text-gradient">
                PREDICTIVE AI
              </span>
              <span className="ml-1.5 hidden rounded-md border border-line bg-navy-800/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-300 sm:inline-block">
                ENTERPRISE
              </span>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-6 lg:flex text-xs font-semibold text-ink-dim">
            <a href="#overview" className="hover:text-sky-300 transition-colors">
              {t('Overview')}
            </a>
            <a href="#walkthrough" className="hover:text-sky-300 transition-colors">
              {t('How It Works')}
            </a>
            <a href="#problems" className="hover:text-sky-300 transition-colors">
              {t('Solutions')}
            </a>
            <a href="#features" className="hover:text-sky-300 transition-colors">
              {t('Features')}
            </a>
            <a href="#roles" className="hover:text-sky-300 transition-colors">
              {t('Workspaces')}
            </a>
            <a href="#security" className="hover:text-sky-300 transition-colors">
              {t('Security & Trust')}
            </a>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            {/* Language Toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-navy-900/80 px-2.5 py-1.5 text-xs font-semibold text-ink-dim hover:text-sky-300 hover:border-sky-400/40 transition-colors"
              title="Toggle Language (EN/AR)"
            >
              <Languages className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-mono text-[11px] font-bold">
                {language === 'en' ? 'AR' : 'EN'}
              </span>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-line bg-navy-900/80 p-1.5 text-ink-dim hover:text-sky-300 hover:border-sky-400/40 transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-300" />
              ) : (
                <Moon className="h-4 w-4 text-sky-400" />
              )}
            </button>

            {currentUser && currentUser.status === 'active' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="btn-primary text-xs font-bold shadow-lg"
                >
                  <span>{t('Go to Workspace')}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={signOutUser}
                  className="rounded-lg border border-line bg-navy-900/80 px-2.5 py-1.5 text-xs font-semibold text-ink-dim hover:text-red-400 hover:border-red-500/40 transition-colors"
                >
                  {t('Sign Out')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openAuth('signin')}
                className="btn-primary text-xs font-bold shadow-lg"
              >
                <Shield className="h-3.5 w-3.5 text-sky-300" />
                <span>{t('Sign In')}</span>
              </button>
            )}

            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg border border-line p-1.5 text-ink-dim hover:text-ink lg:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="border-b border-line bg-navy-900/95 px-4 py-4 backdrop-blur-2xl lg:hidden animate-fadeIn">
            <nav className="flex flex-col gap-3 text-xs font-semibold text-ink-dim">
              <a
                href="#overview"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('Overview')}
              </a>
              <a
                href="#walkthrough"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('How It Works')}
              </a>
              <a
                href="#problems"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('Solutions')}
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('Features')}
              </a>
              <a
                href="#roles"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('Workspaces')}
              </a>
              <a
                href="#security"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 hover:text-sky-300"
              >
                {t('Security & Trust')}
              </a>
              <div className="pt-2 flex flex-col gap-2">
                {currentUser && currentUser.status === 'active' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleLaunchApp}
                      className="btn-primary w-full justify-center py-2 text-xs font-bold"
                    >
                      {t('Go to Workspace')}
                    </button>
                    <button
                      type="button"
                      onClick={signOutUser}
                      className="w-full rounded-lg border border-line bg-navy-800 py-2 text-xs font-bold text-red-400"
                    >
                      {t('Sign Out')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuth('signin')}
                    className="btn-primary w-full justify-center py-2 text-xs font-bold"
                  >
                    {t('Sign In')}
                  </button>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section
        id="overview"
        className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 lg:px-8"
      >
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Headline & Value Proposition */}
          <div className="space-y-6 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/10 px-3.5 py-1 text-xs font-semibold text-sky-300 shadow-sm backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{t('Enterprise Industrial AI SaaS')}</span>
              <span className="text-ink-faint">·</span>
              <span className="text-emerald-300 font-mono">99.8% Reliability Target</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.12]">
              {language === 'ar' ? (
                <>
                  تنبأ بالأعطال. <span className="text-gradient">امنع التوقف.</span> حافظ
                  على تدفق الإنتاج.
                </>
              ) : (
                <>
                  Predict Failures.{' '}
                  <span className="text-gradient">Prevent Downtime.</span> Keep Production
                  Moving.
                </>
              )}
            </h1>

            <p className="max-w-xl text-sm sm:text-base leading-relaxed text-ink-dim">
              {t(
                'Transform machine data into actionable maintenance intelligence. Monitor equipment health, identify potential failures, prioritize maintenance, and coordinate your team through one intelligent platform.'
              )}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {currentUser && currentUser.status === 'active' ? (
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="btn-primary px-6 py-3 text-sm font-bold shadow-xl shadow-sky-500/20"
                >
                  <span>{t('Go to Platform Workspace')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAuth('signin')}
                    className="btn-primary px-6 py-3 text-sm font-bold shadow-xl shadow-sky-500/20"
                  >
                    <Shield className="h-4 w-4" />
                    <span>{t('Sign In to Platform')}</span>
                  </button>
                  <a
                    href="#walkthrough"
                    className="rounded-xl border border-line bg-navy-900/90 px-5 py-3 text-sm font-semibold text-ink hover:bg-navy-800 hover:border-sky-400/40 transition-all inline-flex items-center gap-2"
                  >
                    <span>{t('How It Works')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </>
              )}
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-line/60">
              <div>
                <p className="font-mono text-xl sm:text-2xl font-black text-sky-400">
                  100%
                </p>
                <p className="text-[11px] text-ink-faint">{t('Deny-by-Default RBAC')}</p>
              </div>
              <div>
                <p className="font-mono text-xl sm:text-2xl font-black text-emerald-400">
                  &lt;50ms
                </p>
                <p className="text-[11px] text-ink-faint">{t('Inference Latency')}</p>
              </div>
              <div>
                <p className="font-mono text-xl sm:text-2xl font-black text-indigo-400">
                  RLS
                </p>
                <p className="text-[11px] text-ink-faint">{t('Supabase Protected')}</p>
              </div>
            </div>
          </div>

          {/* Product Preview Card */}
          <div className="lg:col-span-5">
            <div
              className="relative overflow-hidden rounded-2xl border border-sky-400/30 p-5 shadow-2xl backdrop-blur-2xl"
              style={{
                backgroundColor: 'rgb(var(--navy-900) / 0.95)',
                backgroundImage:
                  'radial-gradient(circle at top right, rgba(56, 189, 248, 0.16) 0%, transparent 65%), linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(11, 17, 32, 0.98) 100%)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-line/60">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-mono text-xs font-bold text-ink">
                    CNC Milling Station Alpha
                  </span>
                </div>
                <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  Bay A · Line 1
                </span>
              </div>

              {/* Gauge and Indicators */}
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="rounded-xl border border-line bg-navy-800/60 p-3 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-emerald-400/40 bg-emerald-500/10 font-mono text-xl font-black text-emerald-300 shadow-[0_0_15px_-3px_rgba(52,211,153,0.3)]">
                    94%
                  </div>
                  <p className="mt-2 text-[10.5px] font-semibold text-ink-dim">
                    {t('Equipment Health Score')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-line bg-navy-800/60 p-2.5">
                    <div className="flex justify-between text-[10px] text-ink-faint">
                      <span>{t('Failure Probability')}</span>
                      <span className="font-mono font-bold text-emerald-400">6.0%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-navy-900 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full"
                        style={{ width: '6%' }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-navy-800/60 p-2.5">
                    <div className="flex justify-between text-[10px] text-ink-faint">
                      <span>{t('Thermal Anomaly')}</span>
                      <span className="font-mono font-bold text-sky-400">
                        0.02 (Nominal)
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-navy-900 overflow-hidden">
                      <div
                        className="h-full bg-sky-400 rounded-full"
                        style={{ width: '12%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Recommendation Badge */}
              <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
                <div className="flex items-center gap-1.5 font-bold text-sky-300 mb-1">
                  <Brain className="h-3.5 w-3.5" />
                  <span>{t('AI Prescriptive Guidance')}</span>
                </div>
                <p className="text-[11px] text-ink-dim">
                  Spindle vibration harmonics stable. Next scheduled preventive inspection
                  in 16 days.
                </p>
              </div>

              {/* Action Button inside preview */}
              <div className="mt-3 flex items-center justify-between pt-3 border-t border-line/60">
                <span className="text-[10px] text-ink-faint font-mono">
                  Assigned Tech: Ahmed H.
                </span>
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/30 transition-colors"
                >
                  {t('View Machine Details')} →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Product Walkthrough */}
      <section
        id="walkthrough"
        className="relative z-10 border-t border-line/70 bg-navy-900/50 py-20 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-xs font-semibold text-sky-300">
              <RotateCw className="h-3 w-3 animate-spin" />
              <span>{t('Interactive Product Walkthrough')}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">
              {t('From Sensor Telemetry to Resolved Work Order')}
            </h2>
            <p className="text-xs sm:text-sm text-ink-dim">
              {t(
                'Follow the automated 7-step sequence connecting raw machinery vibration data to field technician resolution.'
              )}
            </p>
          </div>

          {/* Stepper Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {WALKTHROUGH_STEPS.map((step, idx) => (
              <button
                key={step.step}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                  activeStep === idx
                    ? 'border border-sky-400/50 bg-sky-500/20 text-sky-200 shadow-md scale-105'
                    : 'border border-line/60 bg-navy-800/60 text-ink-dim hover:bg-navy-700/60'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                    activeStep === idx
                      ? 'bg-sky-400 text-navy-950'
                      : 'bg-navy-700 text-ink-faint'
                  }`}
                >
                  {step.step}
                </span>
                <span className="hidden sm:inline">
                  {language === 'ar' ? step.titleAr : step.title}
                </span>
              </button>
            ))}
          </div>

          {/* Step Active Card Display */}
          <div className="mt-8 rounded-2xl border border-sky-400/25 bg-navy-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="grid gap-8 lg:grid-cols-12 items-center">
              <div className="space-y-4 lg:col-span-7">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-300">
                    {currentWalkthrough.badge}
                  </span>
                  <span className="text-xs font-mono text-ink-faint">
                    Step {currentWalkthrough.step} of 7
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-ink">
                  {language === 'ar'
                    ? currentWalkthrough.titleAr
                    : currentWalkthrough.title}
                </h3>

                <p className="text-sm leading-relaxed text-ink-dim">
                  {language === 'ar'
                    ? currentWalkthrough.descAr
                    : currentWalkthrough.desc}
                </p>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveStep((prev) => (prev + 1) % WALKTHROUGH_STEPS.length)
                    }
                    className="btn-primary text-xs font-bold"
                  >
                    <span>{t('Next Stage')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleLaunchApp}
                    className="rounded-lg border border-line bg-navy-800/80 px-3.5 py-2 text-xs font-semibold text-ink-dim hover:text-ink"
                  >
                    {t('Try in Workspace')} →
                  </button>
                </div>
              </div>

              {/* Dynamic Live Metric Stage Display */}
              <div className="lg:col-span-5">
                <div className="rounded-xl border border-line bg-navy-800/80 p-5 space-y-3.5 shadow-inner">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-line">
                    <span className="font-mono text-ink-faint">SIMULATED TELEMETRY</span>
                    <span className="font-mono text-emerald-400 text-[11px]">
                      ● ACTIVE INGESTION
                    </span>
                  </div>

                  {currentWalkthrough.metrics.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-line/60 bg-navy-900/60 p-2.5"
                    >
                      <span className="text-xs text-ink-dim">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">
                          {m.val}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${
                            m.status === 'Critical' || m.status === 'Severe'
                              ? 'bg-red-500/20 text-red-300'
                              : m.status === 'Warning' || m.status === 'Elevated'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  <p className="text-[10px] text-ink-faint pt-1">
                    * Illustrative sequence showing edge-to-cloud automated dispatch
                    pipeline.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution */}
      <section
        id="problems"
        className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-xs font-semibold text-sky-300">
            <Sliders className="h-3 w-3" />
            <span>{t('Industrial Challenges & Solutions')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">
            {t('Eliminating Reactive Maintenance & Hidden Costs')}
          </h2>
          <p className="text-xs sm:text-sm text-ink-dim">
            {t(
              'How modern factories transition from costly equipment seizures to autonomous prescriptive reliability.'
            )}
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              problem: 'Unexpected Machine Downtime',
              problemAr: 'التوقف المفاجئ للآلات وتكاليفه',
              solution: 'Multi-Modal ML Prediction',
              solutionAr: 'التنبؤ الذكي متعدد النماذج',
              desc: 'Unplanned downtime averages $260k/hour in automotive and machining. Our models catch early wear patterns weeks in advance.',
              descAr:
                'التوقف المفاجئ يكلف آلاف الدولارات في الساعة. نماذجنا ترصد إشارات التآكل قبل أسابيع.',
              icon: AlertTriangle,
              tone: 'red',
            },
            {
              problem: 'Delayed Anomaly Recognition',
              problemAr: 'تأخر اكتشاف الشذوذ الميكانيكي',
              solution: 'Continuous Anomaly Classification',
              solutionAr: 'تصنيف مستمر لشذوذ الإشارات',
              desc: 'Subtle high-frequency vibrations escape manual rounds. Algorithmic thresholds spot micro-deviations in real time.',
              descAr:
                'الاهتزازات الدقيقة لا يلاحظها الفحص اليدوي. الخوارزميات ترصد الانحرافات اللحظية بدقة.',
              icon: Activity,
              tone: 'amber',
            },
            {
              problem: 'Disjointed Maintenance Records',
              problemAr: 'تشتت سجلات وأوامر الصيانة',
              solution: 'Unified Digital CMMS & Work Orders',
              solutionAr: 'نظام رقمي موحد لأوامر العمل',
              desc: 'Paper logs and disparate spreadsheets cause missed work. Digital orders flow directly from predictive triggers to technicians.',
              descAr:
                'السجلات الورقية تسبب إهمال الصيانة. أوامر العمل الرقمية ترتبط مباشرة بتنبيهات الذكاء الاصطناعي.',
              icon: FileText,
              tone: 'sky',
            },
            {
              problem: 'Unclear Technician Workloads',
              problemAr: 'عدم وضوح أعباء وتوزيع الفنيين',
              solution: 'Scoped Fleet Assignments',
              solutionAr: 'إسناد الآلات بنطاقات عمل محددة',
              desc: 'Engineers lack visibility into who owns which bay. Assign dedicated machine fleets with strict operational boundaries.',
              descAr:
                'تعيين أساطيل الآلات للفنيين بنطاقات واضحة تمنع التداخل وتضمن المساءلة.',
              icon: Users,
              tone: 'indigo',
            },
            {
              problem: 'Unverified Access & Insecure Systems',
              problemAr: 'صلاحيات وصول غير مقيدة أو آمنة',
              solution: 'Supabase RLS & Strict RBAC',
              solutionAr: 'أمان Supabase RLS والتحكم الصارم',
              desc: 'Open systems allow accidental configuration overrides. Deny-by-default role permissions and PostgreSQL RLS secure every query.',
              descAr:
                'سياسات RLS على مستوى قاعدة البيانات مع مصفوفة صلاحيات صارمة تمنع التعديلات غير المصرح بها.',
              icon: ShieldCheck,
              tone: 'emerald',
            },
            {
              problem: 'Isolated Machine Knowledge',
              problemAr: 'صعوبة تشخيص الأعطال المعقدة',
              solution: 'AI Maintenance Assistant & RAG',
              solutionAr: 'مساعد ذكي للتشخيص ودليل الصيانة',
              desc: 'Complex mechanical manuals take hours to browse. The AI Assistant interprets vibration signatures and suggests manufacturer fixes.',
              descAr:
                'المساعد الذكي يحلل إشارات الأعطال ويوجه الفني لأسرع إجراء معتمد من الشركة المصنعة.',
              icon: Brain,
              tone: 'cyan',
            },
          ].map((item, index) => {
            const Icon = item.icon
            return (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl border border-line/70 bg-navy-900/60 p-6 backdrop-blur-md transition-all hover:border-sky-400/40 hover:bg-navy-800/60"
              >
                <div className="flex items-center justify-between pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 text-sky-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[10px] text-ink-faint">
                    0{index + 1}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
                    {language === 'ar' ? item.problemAr : item.problem}
                  </p>
                  <h4 className="text-base font-bold text-ink group-hover:text-sky-300 transition-colors">
                    {language === 'ar' ? item.solutionAr : item.solution}
                  </h4>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-ink-dim">
                  {language === 'ar' ? item.descAr : item.desc}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Feature Showcase */}
      <section
        id="features"
        className="relative z-10 border-t border-line/70 bg-navy-900/40 py-20 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-xs font-semibold text-sky-300">
              <Zap className="h-3 w-3" />
              <span>{t('Core Platform Features')}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">
              {t('Industrial Intelligence Suite')}
            </h2>
            <p className="text-xs sm:text-sm text-ink-dim">
              {t(
                'A complete ecosystem built for plant managers, reliability engineers, and field technicians.'
              )}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Fleet Health Monitoring',
                desc: 'Real-time telemetry aggregation with health score indexes and automated risk status across all production bays.',
                icon: Gauge,
              },
              {
                title: 'Predictive Failure Classification',
                desc: 'Machine learning classification for Tool Wear (TWF), Heat Dissipation (HDF), Power (PWF), and Overstrain (OSF) failures.',
                icon: Brain,
              },
              {
                title: 'Live Anomaly Detection',
                desc: 'Unsupervised Autoencoder scoring identifying out-of-distribution sensor shifts before warning thresholds trigger.',
                icon: Activity,
              },
              {
                title: 'Preventive Work Orders',
                desc: 'Kanban & timeline maintenance orders with downtime logging, cost tracking, and allowed state transitions.',
                icon: CalendarCheck,
              },
              {
                title: 'Role-Based Access Control',
                desc: 'Deny-by-default architecture separating Admin governance, Manager operations, and Technician scopes.',
                icon: Shield,
              },
              {
                title: 'AI Diagnostic Assistant',
                desc: 'Interactive maintenance copilot with multilingual Arabic & English conversational troubleshooting.',
                icon: Sparkles,
              },
            ].map((f, i) => {
              const Icon = f.icon
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-line bg-navy-800/50 p-6 hover:border-sky-400/40 hover:bg-navy-800/80 transition-all"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 text-sky-400 mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h4 className="text-base font-bold text-ink mb-2">{f.title}</h4>
                  <p className="text-xs text-ink-dim leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Role-Based Experience Preview */}
      <section
        id="roles"
        className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-xs font-semibold text-sky-300">
            <UserCheck className="h-3 w-3" />
            <span>{t('Tailored Workspaces')}</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">
            {t('Purpose-Built for Every Operational Stakeholder')}
          </h2>
          <p className="text-xs sm:text-sm text-ink-dim">
            {t(
              'Strict RBAC ensures users see only the data, controls, and equipment relevant to their duties.'
            )}
          </p>
        </div>

        {/* Role Tabs */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-xl border border-line bg-navy-900/80 p-1">
            <button
              type="button"
              onClick={() => setActiveRoleTab('admin')}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                activeRoleTab === 'admin'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {t('Plant Administrator')}
            </button>
            <button
              type="button"
              onClick={() => setActiveRoleTab('manager')}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                activeRoleTab === 'manager'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {t('Maintenance Manager')}
            </button>
            <button
              type="button"
              onClick={() => setActiveRoleTab('technician')}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                activeRoleTab === 'technician'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {t('Field Technician')}
            </button>
          </div>
        </div>

        {/* Role Content Card */}
        <div className="mt-8 rounded-2xl border border-line bg-navy-900/90 p-6 sm:p-8 backdrop-blur-xl">
          {activeRoleTab === 'admin' && (
            <div className="grid gap-6 lg:grid-cols-2 items-center">
              <div className="space-y-4">
                <span className="rounded-md border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-300">
                  GOVERNANCE & SECURITY SCOPE
                </span>
                <h3 className="text-xl font-bold text-ink">
                  Administrative & System Governance Workspace
                </h3>
                <p className="text-xs text-ink-dim leading-relaxed">
                  Plant Admins manage user provisioning, enforce invitation workflows,
                  assign roles, monitor immutable security audit logs, configure machine
                  records, and tune platform thresholds.
                </p>
                <ul className="space-y-2 text-xs text-ink-dim">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      User directory management & invitation-only account provisioning
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Append-only security audit trail tracking all authorization events
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Equipment registration, decommissioning, and factory settings
                    </span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-navy-800/80 p-4 space-y-2 text-xs font-mono">
                <div className="text-sky-300 font-bold">Admin Navigation Items:</div>
                <div className="grid grid-cols-2 gap-2 text-ink-dim text-[11px]">
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Overview Dashboard
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Users & Access
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Machine Management
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Security Audit Trail
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● ML Quality Models
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Factory Settings
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeRoleTab === 'manager' && (
            <div className="grid gap-6 lg:grid-cols-2 items-center">
              <div className="space-y-4">
                <span className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-300">
                  OPERATIONAL COMMAND SCOPE
                </span>
                <h3 className="text-xl font-bold text-ink">
                  Plant Reliability & Maintenance Operations
                </h3>
                <p className="text-xs text-ink-dim leading-relaxed">
                  Maintenance Managers oversee fleet-wide health scores, prioritize
                  alerts, schedule preventive work orders, and assign technicians to
                  equipment based on bay specialties.
                </p>
                <ul className="space-y-2 text-xs text-ink-dim">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Real-time monitoring of all machines, health scores, and failure
                      risks
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      One-click work order creation directly from critical predictive
                      alerts
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Technician workload tracking, assignments, and MTBF/MTTR analytics
                    </span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-navy-800/80 p-4 space-y-2 text-xs font-mono">
                <div className="text-sky-300 font-bold">Manager Navigation Items:</div>
                <div className="grid grid-cols-2 gap-2 text-ink-dim text-[11px]">
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Overview Fleet Dashboard
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Plant Machines
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Maintenance Dispatch
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Predictive Alerts
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Operational Reports
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● AI Diagnostics Copilot
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeRoleTab === 'technician' && (
            <div className="grid gap-6 lg:grid-cols-2 items-center">
              <div className="space-y-4">
                <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                  ASSIGNED FLEET WORKSPACE
                </span>
                <h3 className="text-xl font-bold text-ink">
                  Dedicated Field Technician Workspace
                </h3>
                <p className="text-xs text-ink-dim leading-relaxed">
                  Field Technicians access only their assigned machine units and assigned
                  work orders. They advance task statuses (Scheduled → In Progress →
                  Completed) with work logs and downtime records.
                </p>
                <ul className="space-y-2 text-xs text-ink-dim">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Access restricted to assigned equipment (e.g. Line 1: M-001..M-003)
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Task advancement controls restricted to own maintenance orders
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      AI Assistant troubleshooting queries on assigned equipment manuals
                    </span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-navy-800/80 p-4 space-y-2 text-xs font-mono">
                <div className="text-sky-300 font-bold">
                  Technician Scoped Navigation:
                </div>
                <div className="grid grid-cols-2 gap-2 text-ink-dim text-[11px]">
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Assigned Fleet Overview
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Assigned Machines Only
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● My Maintenance Orders
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Machine Sensor Telemetry
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● Shift Reports
                  </div>
                  <div className="p-2 rounded bg-navy-900/80 border border-line">
                    ● AI Assistant
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Security & Trust */}
      <section
        id="security"
        className="relative z-10 border-t border-line/70 bg-navy-900/50 py-20 backdrop-blur-md"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="h-3 w-3" />
              <span>{t('Enterprise Security & Trust')}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-ink tracking-tight">
              {t('Defense-in-Depth Architecture')}
            </h2>
            <p className="text-xs sm:text-sm text-ink-dim">
              {t(
                'How we protect critical industrial telemetry, operational records, and equipment control.'
              )}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-line bg-navy-800/60 p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                <Database className="h-4 w-4" />
              </div>
              <h4 className="font-bold text-sm text-ink">PostgreSQL RLS</h4>
              <p className="text-xs text-ink-dim leading-relaxed">
                Supabase Row Level Security enforced at database boundary. Direct queries
                cannot bypass technician scope.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-navy-800/60 p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Lock className="h-4 w-4" />
              </div>
              <h4 className="font-bold text-sm text-ink">Deny-by-Default RBAC</h4>
              <p className="text-xs text-ink-dim leading-relaxed">
                27 dot-notation permissions evaluated centrally. Missing permissions fail
                closed instantly with HTTP 403.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-navy-800/60 p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                <Server className="h-4 w-4" />
              </div>
              <h4 className="font-bold text-sm text-ink">Immutable Audit Trail</h4>
              <p className="text-xs text-ink-dim leading-relaxed">
                All role updates, machine deletions, and assignment modifications recorded
                to append-only security logs.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-navy-800/60 p-5 space-y-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <KeyRound className="h-4 w-4" />
              </div>
              <h4 className="font-bold text-sm text-ink">Invitation-Only Flow</h4>
              <p className="text-xs text-ink-dim leading-relaxed">
                No self-registered admin accounts. User provisioning is strictly executed
                by authenticated plant administrators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-sky-400/35 p-8 sm:p-12 text-center shadow-2xl backdrop-blur-2xl"
          style={{
            backgroundColor: 'rgb(var(--navy-900) / 0.95)',
            backgroundImage:
              'radial-gradient(circle at top center, rgba(56, 189, 248, 0.22) 0%, transparent 70%), linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(11, 17, 32, 0.98) 100%)',
          }}
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 font-mono text-xs font-bold text-sky-300">
              DEPLOY TODAY
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-ink tracking-tight">
              {language === 'ar' ? (
                <>
                  جاهز لإنهاء <span className="text-gradient">التوقف غير المخطط له</span>؟
                </>
              ) : (
                <>
                  Ready to eliminate{' '}
                  <span className="text-gradient">unplanned downtime</span>?
                </>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-ink-dim leading-relaxed">
              {t(
                'Explore the interactive predictive maintenance platform and see how automated intelligence keeps manufacturing moving.'
              )}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              {currentUser && currentUser.status === 'active' ? (
                <button
                  type="button"
                  onClick={handleLaunchApp}
                  className="btn-primary px-8 py-3.5 text-sm font-bold shadow-xl shadow-sky-500/25"
                >
                  <span>{t('Go to Platform Workspace')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAuth('signin')}
                    className="btn-primary px-8 py-3.5 text-sm font-bold shadow-xl shadow-sky-500/25"
                  >
                    <Shield className="h-4 w-4" />
                    <span>{t('Sign In to Platform')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth('request')}
                    className="rounded-xl border border-line bg-navy-800/80 px-6 py-3.5 text-sm font-semibold text-ink hover:bg-navy-700 hover:border-sky-400/40 transition-all"
                  >
                    {t('Access Policy')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-line/60 bg-navy-950 py-10 text-xs text-ink-faint">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/10 text-sky-400">
                <Factory className="h-4 w-4" />
              </div>
              <span className="font-mono font-bold text-ink">
                Industrial AI Predictive Platform
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#overview" className="hover:text-ink transition-colors">
                {t('Overview')}
              </a>
              <a href="#walkthrough" className="hover:text-ink transition-colors">
                {t('Walkthrough')}
              </a>
              <a href="#security" className="hover:text-ink transition-colors">
                {t('Security')}
              </a>
              <button
                type="button"
                onClick={() => openAuth('signin')}
                className="hover:text-ink transition-colors"
              >
                {t('Sign In')}
              </button>
            </div>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-line/40 pt-4 text-[11px]">
            <p>© 2026 Industrial AI Platform. All rights reserved.</p>
            <p className="font-mono text-ink-faint">
              Protected by Supabase Auth & PostgreSQL Row Level Security (RLS)
            </p>
          </div>
        </div>
      </footer>

      {/* Authentication & Access Request Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
        onSuccess={handleLaunchApp}
      />
    </div>
  )
}
