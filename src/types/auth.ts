// ---------------------------------------------------------------------------
// Authentication, Role-Based Access Control (RBAC), and Audit Types
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'manager' | 'technician'

export type AccountStatus = 'active' | 'deactivated'

export type Permission =
  // Dashboard
  | 'dashboard.view'
  // User Management
  | 'users.read'
  | 'users.create'
  | 'users.update'
  | 'users.deactivate'
  // Roles & Permissions
  | 'roles.read'
  | 'roles.manage'
  | 'permissions.manage'
  // Machines
  | 'machines.read'
  | 'machines.create'
  | 'machines.update'
  | 'machines.delete'
  | 'machines.assign'
  // Alerts
  | 'alerts.read'
  | 'alerts.update'
  // Maintenance Work Orders
  | 'maintenance.read'
  | 'maintenance.create'
  | 'maintenance.assign'
  | 'maintenance.update'
  | 'maintenance.complete'
  // Reports
  | 'reports.read'
  | 'reports.export'
  // Models
  | 'models.read'
  | 'models.manage'
  // Global Settings
  | 'settings.read'
  | 'settings.manage'
  // Assistant
  | 'assistant.use'
  // Security & Audit
  | 'audit.read'

export interface AuthUser {
  id: string
  name: string
  nameAr?: string
  email: string
  role: UserRole
  status: AccountStatus
  avatarInitials: string
  avatarInitialsAr: string
  department: string
  departmentAr: string
  assignedMachineIds: string[]
  customPermissions?: Permission[]
  createdAt: string
  lastLoginAt: string
}

export interface PermissionGroup {
  id: string
  title: string
  titleAr: string
  description: string
  descriptionAr: string
  permissions: {
    key: Permission
    name: string
    nameAr: string
    desc: string
    descAr: string
    isNavModule?: boolean
  }[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'nav_modules',
    title: 'Navigation & Module Visibility',
    titleAr: 'ظهور الأقسام والصفحات في القائمة',
    description: 'Control which main sections and screens are visible and accessible to the employee',
    descriptionAr: 'تحديد الأقسام والصفحات الرئيسية التي تظهر للموظف ويستطيع الدخول إليها',
    permissions: [
      {
        key: 'dashboard.view',
        name: 'Dashboard Overview',
        nameAr: 'لوحة التحكم والمؤشرات الرئيسية',
        desc: 'Access the real-time operational dashboard and fleet health summary',
        descAr: 'عرض ملخص صحة المصنع ومؤشرات الأداء اللحظية',
        isNavModule: true,
      },
      {
        key: 'machines.read',
        name: 'Machines Fleet',
        nameAr: 'أسطول الآلات والمعدات',
        desc: 'View machines directory, sensor health telemetry and diagnostics',
        descAr: 'استعراض سجل الآلات وقياسات المستشعرات والتشخيص',
        isNavModule: true,
      },
      {
        key: 'maintenance.read',
        name: 'Maintenance Orders',
        nameAr: 'أوامر وجداول الصيانة',
        desc: 'Access scheduled, upcoming and historical maintenance work orders',
        descAr: 'عرض وتتبع أوامر العمل والصيانة المجدولة والتاريخية',
        isNavModule: true,
      },
      {
        key: 'models.read',
        name: 'AI Quality Inspection',
        nameAr: 'فحص الجودة بالذكاء الاصطناعي',
        desc: 'Access automated defect detection and visual quality inspection models',
        descAr: 'استخدام نماذج فحص عيوب المنتجات والتحقق البصري',
        isNavModule: true,
      },
      {
        key: 'assistant.use',
        name: 'Industrial AI Assistant (Chatbot)',
        nameAr: 'المساعد الذكي الصناعي (الشات بوت)',
        desc: 'Access the interactive AI chatbot with isolated private conversation history',
        descAr: 'استخدام الشات بوت التفاعلي مع سجل محادثات منفصل وخاص بكل مستخدم',
        isNavModule: true,
      },
      {
        key: 'alerts.read',
        name: 'Alerts Center',
        nameAr: 'مركز التنبيهات والإشعارات',
        desc: 'View real-time anomaly alerts across equipment and production',
        descAr: 'عرض الإشعارات والتحذيرات الحرجة للآلات والعمليات',
        isNavModule: true,
      },
      {
        key: 'reports.read',
        name: 'Reports & Analytics',
        nameAr: 'التقارير والتحليلات البيانية',
        desc: 'Access reliability, downtime, and failure risk analytics reports',
        descAr: 'الاطلاع على الرسوم البيانية وتقارير الموثوقية والتوقفات',
        isNavModule: true,
      },
      {
        key: 'settings.read',
        name: 'System Settings',
        nameAr: 'إعدادات المنصة',
        desc: 'View system configuration, thresholds, and AI models parameters',
        descAr: 'عرض إعدادات النظام وحدود التنبيهات ونماذج الذكاء الاصطناعي',
        isNavModule: true,
      },
      {
        key: 'users.read',
        name: 'User Management & RBAC',
        nameAr: 'إدارة المستخدمين والموظفين',
        desc: 'Access organizational user directory and security logs',
        descAr: 'استعراض قائمة الموظفين وحسابات المنصة وسجلات الأمان',
        isNavModule: true,
      },
    ],
  },
  {
    id: 'machines_mgmt',
    title: 'Equipment & Fleet Management',
    titleAr: 'إدارة وتعديل الآلات',
    description: 'Permissions for adding, modifying, assigning, or deleting machine profiles',
    descriptionAr: 'صلاحيات إضافة وتحديث وإسناد وحذف الآلات والمعدات',
    permissions: [
      {
        key: 'machines.create',
        name: 'Add New Equipment',
        nameAr: 'إضافة آلة جديدة',
        desc: 'Register new machines into the factory telemetry fleet',
        descAr: 'تسجيل وإدخال معدات جديدة إلى قاعدة بيانات المصنع',
      },
      {
        key: 'machines.update',
        name: 'Update Machine Telemetry',
        nameAr: 'تعديل بيانات الآلة',
        desc: 'Edit machine specifications, thresholds, and operational metadata',
        descAr: 'تحديث المواصفات الفنية وحدود التشغيل للمعدة',
      },
      {
        key: 'machines.delete',
        name: 'Remove Equipment',
        nameAr: 'حذف آلة',
        desc: 'Decommission or delete equipment from active monitoring',
        descAr: 'إزالة أو إلغاء تفعيل المعدة من المراقبة المباشرة',
      },
      {
        key: 'machines.assign',
        name: 'Assign Equipment',
        nameAr: 'تعيين الآلات للفنيين',
        desc: 'Authorize technicians to specific machinery scopes',
        descAr: 'تخصيص الآلات وتوزيعها على الفنيين المعتمدين',
      },
    ],
  },
  {
    id: 'maintenance_mgmt',
    title: 'Maintenance Actions & Execution',
    titleAr: 'إجراءات وتنفيذ الصيانة',
    description: 'Work order generation, assignment, updates, and completion',
    descriptionAr: 'إنشاء أوامر العمل وتكليف الفنيين وتحديث وإغلاق الصيانة',
    permissions: [
      {
        key: 'maintenance.create',
        name: 'Create Work Orders',
        nameAr: 'إنشاء أمر صيانة',
        desc: 'Generate new corrective or preventative work orders',
        descAr: 'إصدار أمر عمل جديد وقائي أو طارئ',
      },
      {
        key: 'maintenance.assign',
        name: 'Assign Work Orders',
        nameAr: 'تكليف الفنيين بأمر الصيانة',
        desc: 'Assign specific work orders to technicians',
        descAr: 'توجيه وتكليف الفنيين بمهام وأوامر الصيانة',
      },
      {
        key: 'maintenance.update',
        name: 'Update Order Progress',
        nameAr: 'تحديث حالة العمل',
        desc: 'Update work order status, log notes, and add labor hours',
        descAr: 'تسجيل تقدم أعمال الصيانة والملاحظات الفنية',
      },
      {
        key: 'maintenance.complete',
        name: 'Complete & Close Work Orders',
        nameAr: 'إتمام وإغلاق أمر الصيانة',
        desc: 'Sign off and archive completed maintenance orders',
        descAr: 'اعتماد إنهاء الصيانة وإغلاق أمر العمل',
      },
    ],
  },
  {
    id: 'admin_security',
    title: 'Administration, Users & Security',
    titleAr: 'الإدارة وصلاحيات المستخدمين والأمان',
    description: 'Full administrative governance, employee record management, and audit trail',
    descriptionAr: 'التحكم الإداري الكامل وتعديل بيانات الموظفين وسجل التدقيق الأمني',
    permissions: [
      {
        key: 'users.create',
        name: 'Create & Provision Employees',
        nameAr: 'إضافة ودعوة موظفين جدد',
        desc: 'Provision new employee profiles on the industrial platform',
        descAr: 'إضافة حسابات موظفين جديدة وتعيين أدوارهم',
      },
      {
        key: 'users.update',
        name: 'Edit All Employee Records',
        nameAr: 'تعديل جميع بيانات الموظفين',
        desc: 'Modify employee name, email, department, role, and assignments',
        descAr: 'تعديل الاسم والبريد الإلكتروني والوظيفة والقسم لكافة الموظفين',
      },
      {
        key: 'users.deactivate',
        name: 'Account Activation/Suspension',
        nameAr: 'تفعيل وإيقاف حسابات الموظفين',
        desc: 'Suspend or restore employee access to the factory system',
        descAr: 'إيقاف حساب موظف أو إعادة تنشيطه فورا',
      },
      {
        key: 'roles.manage',
        name: 'Manage Roles',
        nameAr: 'تغيير الأدوار الوظيفية',
        desc: 'Change organizational role (Admin / Manager / Technician)',
        descAr: 'تعديل الدور الوظيفي للمستخدم بين مدير وفني ومسؤول',
      },
      {
        key: 'permissions.manage',
        name: 'Customize User Permissions & Visibility',
        nameAr: 'تخصيص الصلاحيات والظهور الفردي',
        desc: 'Tailor exact permissions and determine visible tabs for each person',
        descAr: 'تحديد ما يظهر وما يخفى لكل مستخدم وتخصيص صلاحياته الفردية',
      },
      {
        key: 'reports.export',
        name: 'Export Reports & Data',
        nameAr: 'تصدير التقارير والبيانات',
        desc: 'Download CSV, PDF and Excel exports of plant analytics',
        descAr: 'تصدير وتحميل التقارير بصيغ PDF و Excel',
      },
      {
        key: 'audit.read',
        name: 'View Security Audit Trail',
        nameAr: 'استعراض سجل التدقيق الأمني',
        desc: 'Audit chronological records of authorization events and changes',
        descAr: 'مراجعة السجل الأمني المباشر وتتبع أي تعديلات تمت على النظام',
      },
    ],
  },
]

export interface AuditEvent {
  id: string
  timestamp: string
  actorId: string
  actorName: string
  actorRole: UserRole
  action: string
  resourceType: string
  resourceId?: string
  outcome: 'ALLOW' | 'DENY'
  details?: string
  metadata?: Record<string, unknown>
}

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}
