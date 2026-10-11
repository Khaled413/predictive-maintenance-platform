-- ==============================================================================
-- PREDICTIVE MAINTENANCE PLATFORM — ENTERPRISE CONSOLIDATED SCHEMA & RBAC
-- Run this single script in the Supabase Dashboard SQL Editor
-- Project: https://supabase.com/dashboard/project/tdlaaykvhuyecjupqoau/sql
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Clean Existing Schema (Idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 3. Core Tables
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES public.roles(id) DEFAULT 'technician',
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'deactivated')),
    avatar_initials TEXT DEFAULT 'US',
    department TEXT DEFAULT 'Plant Operations',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Operational' CHECK (status IN ('Operational', 'Warning', 'Critical', 'Under Maintenance')),
    health_score NUMERIC(5, 2) DEFAULT 95.00,
    failure_risk NUMERIC(5, 2) DEFAULT 5.00,
    location TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    last_maintenance TIMESTAMPTZ DEFAULT now(),
    next_maintenance TIMESTAMPTZ DEFAULT now() + interval '30 days',
    sensors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machine_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active', 'ended', 'inactive')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.maintenance_orders (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Recommended', 'Scheduled', 'In Progress', 'Completed', 'Cancelled')),
    technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    technician_name TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    downtime TEXT DEFAULT '—',
    cost NUMERIC(10, 2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alerts (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info', 'success')),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
    recommended_action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    outcome TEXT NOT NULL DEFAULT 'ALLOW' CHECK (outcome IN ('ALLOW', 'DENY')),
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Security Definier Helper Functions
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role_id FROM public.profiles WHERE id = auth.uid() AND account_status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role_id = 'admin' AND account_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role_id IN ('admin', 'manager') AND account_status = 'active'
    );
$$;

-- Check if current authenticated user has a specific permission key
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.role_permissions rp ON p.role_id = rp.role_id
        JOIN public.permissions perm ON rp.permission_id = perm.id
        WHERE p.id = auth.uid()
          AND p.account_status = 'active'
          AND perm.key = p_permission_key
    );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_machine(p_machine_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.machine_assignments ma
        JOIN public.profiles p ON ma.user_id = p.id
        WHERE ma.machine_id = p_machine_id
          AND ma.user_id = auth.uid()
          AND ma.assignment_status = 'active'
          AND p.account_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_full_name TEXT;
    user_role TEXT;
BEGIN
    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'technician');
    IF user_role NOT IN ('admin', 'manager', 'technician') THEN
        user_role := 'technician';
    END IF;

    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role_id,
        account_status,
        avatar_initials,
        department
    )
    VALUES (
        NEW.id,
        user_full_name,
        NEW.email,
        user_role,
        'active',
        UPPER(SUBSTRING(user_full_name FROM 1 FOR 2)),
        COALESCE(NEW.raw_user_meta_data->>'department', 'Operations')
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        department = EXCLUDED.department;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Enable Row Level Security (Default Deny on ALL tables)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.roles;
CREATE POLICY "Authenticated users can read roles" ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.roles;
CREATE POLICY "Admins can manage roles" ON public.roles FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read permissions" ON public.permissions;
CREATE POLICY "Authenticated users can read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.permissions;
CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read role_permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage role_permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL TO authenticated USING (public.is_admin());

-- 6. Profiles RLS Policies (Non-recursive)
-- Users can always view their own profile row:
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view active profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (
    id = auth.uid()
);

-- Users can view other active profiles in directory:
DROP POLICY IF EXISTS "Users can view active profiles" ON public.profiles;
CREATE POLICY "Users can view active profiles" ON public.profiles FOR SELECT TO authenticated USING (
    account_status = 'active'
);

-- Users can update their own profile fields:
DROP POLICY IF EXISTS "Users can update their own profile fields" ON public.profiles;
CREATE POLICY "Users can update their own profile fields" ON public.profiles FOR UPDATE TO authenticated USING (
    id = auth.uid() AND account_status = 'active'
);

-- Admins can manage all profiles:
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

-- Field protection trigger: non-admins cannot modify role_id or account_status
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        NEW.role_id := OLD.role_id;
        NEW.account_status := OLD.account_status;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

DROP POLICY IF EXISTS "Admins and Managers can view all machines" ON public.machines;
CREATE POLICY "Admins and Managers can view all machines" ON public.machines FOR SELECT TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Technicians view assigned machines only" ON public.machines;
CREATE POLICY "Technicians view assigned machines only" ON public.machines FOR SELECT TO authenticated USING (public.is_assigned_to_machine(id));

DROP POLICY IF EXISTS "Admins can create machines" ON public.machines;
CREATE POLICY "Admins can create machines" ON public.machines FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins and Managers can update machines" ON public.machines;
CREATE POLICY "Admins and Managers can update machines" ON public.machines FOR UPDATE TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Admins can delete machines" ON public.machines;
CREATE POLICY "Admins can delete machines" ON public.machines FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins and Managers can view all machine assignments" ON public.machine_assignments;
CREATE POLICY "Admins and Managers can view all machine assignments" ON public.machine_assignments FOR SELECT TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Technicians view their own machine assignments" ON public.machine_assignments;
CREATE POLICY "Technicians view their own machine assignments" ON public.machine_assignments FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins and Managers can manage assignments" ON public.machine_assignments;
CREATE POLICY "Admins and Managers can manage assignments" ON public.machine_assignments FOR ALL TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Admins and Managers view all maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Admins and Managers view all maintenance orders" ON public.maintenance_orders FOR SELECT TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Technicians view assigned maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Technicians view assigned maintenance orders" ON public.maintenance_orders FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
    AND (technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id))
);

DROP POLICY IF EXISTS "Admins and Managers can create maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Admins and Managers can create maintenance orders" ON public.maintenance_orders FOR INSERT TO authenticated WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Admins and Managers can update maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Admins and Managers can update maintenance orders" ON public.maintenance_orders FOR UPDATE TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Technicians can update their assigned maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Technicians can update their assigned maintenance orders" ON public.maintenance_orders FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
    AND (technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
    AND (technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id))
);

DROP POLICY IF EXISTS "Admins can delete maintenance orders" ON public.maintenance_orders;
CREATE POLICY "Admins can delete maintenance orders" ON public.maintenance_orders FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins and Managers view all alerts" ON public.alerts;
CREATE POLICY "Admins and Managers view all alerts" ON public.alerts FOR SELECT TO authenticated USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Technicians view alerts for assigned machines" ON public.alerts;
CREATE POLICY "Technicians view alerts for assigned machines" ON public.alerts FOR SELECT TO authenticated USING (public.is_assigned_to_machine(machine_id));

DROP POLICY IF EXISTS "Admins and Managers can insert alerts" ON public.alerts;
CREATE POLICY "Admins and Managers can insert alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.is_manager_or_admin());

DROP POLICY IF EXISTS "Authenticated users can update accessible alerts" ON public.alerts;
CREATE POLICY "Authenticated users can update accessible alerts" ON public.alerts FOR UPDATE TO authenticated USING (
    public.is_manager_or_admin() OR public.is_assigned_to_machine(machine_id)
);

-- Audit logs: append-only, immutable!
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can append audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 7. Seed Baseline Roles
INSERT INTO public.roles (id, name, description)
VALUES
    ('admin', 'Admin', 'Plant Administrator with user management and security authority.'),
    ('manager', 'Maintenance Manager', 'Operations manager coordinating technician fleet schedules.'),
    ('technician', 'Technician', 'Reliability technician assigned to specific machinery.')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 8. Seed 28 Granular Permissions
INSERT INTO public.permissions (key, description)
VALUES
    ('dashboard.view', 'View plant operational overview dashboard'),
    ('users.read', 'View user accounts directory and audit logs'),
    ('users.create', 'Provision and invite new platform user accounts'),
    ('users.update', 'Modify user profile information and department assignments'),
    ('users.deactivate', 'Deactivate or restore user account access'),
    ('roles.read', 'Inspect role definitions and assigned permissions'),
    ('roles.manage', 'Modify role assignments and authorizations'),
    ('permissions.manage', 'Manage permission definitions'),
    ('machines.read', 'Inspect machinery profile and sensor telemetry'),
    ('machines.create', 'Register new industrial equipment in the fleet'),
    ('machines.update', 'Modify machine specifications and threshold configurations'),
    ('machines.delete', 'Remove machines and decommission from fleet'),
    ('machines.assign', 'Assign or reassign technicians to equipment'),
    ('alerts.read', 'View equipment anomaly and failure alerts'),
    ('alerts.update', 'Acknowledge, annotate, or resolve alerts'),
    ('maintenance.read', 'View maintenance work orders and schedule'),
    ('maintenance.create', 'Schedule new preventive or corrective maintenance orders'),
    ('maintenance.assign', 'Assign or reassign technicians to work orders'),
    ('maintenance.update', 'Update work order progress, downtime, and cost'),
    ('maintenance.complete', 'Sign off and mark maintenance orders completed'),
    ('reports.read', 'Access reliability, MTBF/MTTR, and shift reports'),
    ('reports.export', 'Export fleet and reliability analytics reports'),
    ('models.read', 'Inspect ML failure prediction and quality inspection models'),
    ('models.manage', 'Adjust ML failure thresholds and model configurations'),
    ('settings.read', 'View system settings and factory configuration'),
    ('settings.manage', 'Modify system settings and integration parameters'),
    ('assistant.use', 'Interact with AI diagnostics assistant'),
    ('audit.read', 'Inspect security audit trail and access logs')
ON CONFLICT (key) DO NOTHING;

-- 9. Role-Permissions Matrix
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'admin', id FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'manager', id FROM public.permissions
WHERE key IN (
    'dashboard.view', 'machines.read', 'machines.create', 'machines.update', 'machines.assign',
    'alerts.read', 'alerts.update', 'maintenance.read', 'maintenance.create', 'maintenance.assign',
    'maintenance.update', 'maintenance.complete', 'reports.read', 'reports.export', 'models.read', 'assistant.use'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'technician', id FROM public.permissions
WHERE key IN (
    'dashboard.view', 'machines.read', 'alerts.read', 'alerts.update',
    'maintenance.read', 'maintenance.update', 'maintenance.complete', 'reports.read', 'assistant.use'
)
ON CONFLICT DO NOTHING;

-- 10. Seed Initial Fleet Machinery (All 12 Fleet Units)
INSERT INTO public.machines (id, name, type, status, health_score, failure_risk, location, manufacturer, model, last_maintenance, next_maintenance)
VALUES
    ('M-001', 'CNC Milling Station Alpha', 'CNC Milling Machine', 'Operational', 94.0, 6.0, 'Bay A - Line 1', 'Siemens Precision', 'Sinumerik 840D', now() - interval '14 days', now() + interval '16 days'),
    ('M-002', 'High-Torque Hydraulic Press 02', 'Hydraulic Press', 'Warning', 68.0, 32.0, 'Bay A - Line 1', 'Bosch Rexroth', 'CytroBox 250', now() - interval '30 days', now() + interval '2 days'),
    ('M-003', 'Centrifugal Cooling Pump C3', 'Industrial Pump', 'Operational', 88.0, 12.0, 'Bay B - Line 1', 'Grundfos', 'CR-95 HighFlow', now() - interval '45 days', now() + interval '10 days'),
    ('M-004', 'Robotic Welding Arm Beta', 'Robotic Arm', 'Operational', 91.0, 9.0, 'Bay C - Line 2', 'KUKA Automation', 'KR QUANTEC 210', now() - interval '20 days', now() + interval '25 days'),
    ('M-005', 'Packaging — Wrapper 1', 'Packaging Machine', 'Warning', 71.0, 56.0, 'Zone C — Final Assembly', 'Ishida', 'CCW-R-214', now() - interval '38 days', now() + interval '2 days'),
    ('M-006', 'Boiler — Steam Unit B', 'Boiler', 'Critical', 58.0, 74.0, 'Utility Room 1 — Steam Plant', 'Bosch Industrial', 'UL-S 8000', now() - interval '55 days', now() - interval '2 days'),
    ('M-007', 'Mixer — Blending Tank 2', 'Mixing Machine', 'Operational', 84.0, 18.0, 'Zone B — Batch Processing', 'GEA', 'M-1050', now() - interval '30 days', now() + interval '15 days'),
    ('M-008', 'Filler — Bottling Line 1', 'Filling Machine', 'Operational', 74.0, 49.0, 'Zone D — Packing Hall 1', 'Krones', 'Modulfill VFS', now() - interval '42 days', now() + interval '5 days'),
    ('M-009', 'Dryer — Tumble Unit 1', 'Dryer', 'Operational', 90.0, 10.0, 'Zone D — Packing Hall 1', 'Cissell', '36LB', now() - interval '28 days', now() + interval '20 days'),
    ('M-010', 'Labeler — Bottling Line 2', 'Labeling Machine', 'Operational', 76.0, 34.0, 'Zone D — Packing Hall 1', 'Krones', 'Contiroll', now() - interval '36 days', now() + interval '10 days'),
    ('M-011', 'Palletizer — Warehouse 1', 'Palletizer', 'Operational', 87.0, 15.0, 'Station 5 — Finished Goods', 'Columbia', 'FL-200', now() - interval '26 days', now() + interval '14 days'),
    ('M-012', 'Air Compressor — Tool Air 2', 'Air Compressor', 'Critical', 66.0, 78.0, 'Utility Room 2 — Compressor Deck', 'Kaeser', 'ASD 40', now() - interval '40 days', now() - interval '3 days')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    health_score = EXCLUDED.health_score,
    failure_risk = EXCLUDED.failure_risk,
    location = EXCLUDED.location,
    manufacturer = EXCLUDED.manufacturer,
    model = EXCLUDED.model;

-- 11. Connect Admin and Seed Initial Test Employees Fleet & Staff
DO $$
DECLARE
    v_admin_id UUID;
    v_mgr_id   UUID := 'a1000000-0000-0000-0000-000000000001';
    v_t1_id    UUID := 'a1000000-0000-0000-0000-000000000002';
    v_t2_id    UUID := 'a1000000-0000-0000-0000-000000000003';
    v_t3_id    UUID := 'a1000000-0000-0000-0000-000000000004';
    v_t4_id    UUID := 'a1000000-0000-0000-0000-000000000005';
    v_pw_hash  TEXT;
BEGIN
    v_pw_hash := crypt('FactoryTest2026!', gen_salt('bf'));

    -- 1. Connect existing admin user (admin@factory.com) to profiles table
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@factory.com' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
        VALUES (v_admin_id, 'Plant Administrator', 'admin@factory.com', 'admin', 'active', 'PA', 'Plant Administration')
        ON CONFLICT (id) DO UPDATE SET role_id = 'admin', account_status = 'active';
    END IF;

    -- 2. Test Manager: Karim Mansour (manager@factory.com)
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@factory.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_mgr_id, 'authenticated', 'authenticated',
            'manager@factory.com', v_pw_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Karim Mansour","role":"manager"}'::jsonb, now(), now()
        );
    ELSE
        SELECT id INTO v_mgr_id FROM auth.users WHERE email = 'manager@factory.com';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
    VALUES (v_mgr_id, 'Karim Mansour', 'manager@factory.com', 'manager', 'active', 'KM', 'Maintenance Operations')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role_id = 'manager', department = EXCLUDED.department, account_status = 'active';

    -- 3. Tech 1: Ahmed Hassan (tech1@factory.com) - Mechanical Reliability
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech1@factory.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_t1_id, 'authenticated', 'authenticated',
            'tech1@factory.com', v_pw_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Ahmed Hassan","role":"technician"}'::jsonb, now(), now()
        );
    ELSE
        SELECT id INTO v_t1_id FROM auth.users WHERE email = 'tech1@factory.com';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
    VALUES (v_t1_id, 'Ahmed Hassan', 'tech1@factory.com', 'technician', 'active', 'AH', 'Mechanical Reliability - Line 1')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role_id = 'technician', department = EXCLUDED.department, account_status = 'active';

    INSERT INTO public.machine_assignments (machine_id, user_id, assignment_status)
    VALUES ('M-001', v_t1_id, 'active'), ('M-002', v_t1_id, 'active'), ('M-003', v_t1_id, 'active')
    ON CONFLICT DO NOTHING;

    -- 4. Tech 2: Sara Nabil (tech2@factory.com) - Robotics & Automation
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech2@factory.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_t2_id, 'authenticated', 'authenticated',
            'tech2@factory.com', v_pw_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Sara Nabil","role":"technician"}'::jsonb, now(), now()
        );
    ELSE
        SELECT id INTO v_t2_id FROM auth.users WHERE email = 'tech2@factory.com';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
    VALUES (v_t2_id, 'Sara Nabil', 'tech2@factory.com', 'technician', 'active', 'SN', 'Electrical & Robotics Automation')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role_id = 'technician', department = EXCLUDED.department, account_status = 'active';

    INSERT INTO public.machine_assignments (machine_id, user_id, assignment_status)
    VALUES ('M-004', v_t2_id, 'active'), ('M-005', v_t2_id, 'active')
    ON CONFLICT DO NOTHING;

    -- 5. Tech 3: Omar Farouk (tech3@factory.com) - Packaging & Utilities
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech3@factory.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_t3_id, 'authenticated', 'authenticated',
            'tech3@factory.com', v_pw_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Omar Farouk","role":"technician"}'::jsonb, now(), now()
        );
    ELSE
        SELECT id INTO v_t3_id FROM auth.users WHERE email = 'tech3@factory.com';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
    VALUES (v_t3_id, 'Omar Farouk', 'tech3@factory.com', 'technician', 'active', 'OF', 'Packaging & Steam Utilities')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role_id = 'technician', department = EXCLUDED.department, account_status = 'active';

    INSERT INTO public.machine_assignments (machine_id, user_id, assignment_status)
    VALUES ('M-006', v_t3_id, 'active'), ('M-007', v_t3_id, 'active')
    ON CONFLICT DO NOTHING;

    -- 6. Tech 4: Mahmoud Tarek (tech4@factory.com) - High Pressure Systems
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'tech4@factory.com') THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_t4_id, 'authenticated', 'authenticated',
            'tech4@factory.com', v_pw_hash, now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Mahmoud Tarek","role":"technician"}'::jsonb, now(), now()
        );
    ELSE
        SELECT id INTO v_t4_id FROM auth.users WHERE email = 'tech4@factory.com';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role_id, account_status, avatar_initials, department)
    VALUES (v_t4_id, 'Mahmoud Tarek', 'tech4@factory.com', 'technician', 'active', 'MT', 'High-Pressure Systems & Air Deck')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role_id = 'technician', department = EXCLUDED.department, account_status = 'active';

    INSERT INTO public.machine_assignments (machine_id, user_id, assignment_status)
    VALUES ('M-008', v_t4_id, 'active'), ('M-012', v_t4_id, 'active')
    ON CONFLICT DO NOTHING;

    -- Safe attempt to seed auth.identities for password login
    BEGIN
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES
            (v_mgr_id::text, v_mgr_id, jsonb_build_object('sub', v_mgr_id::text, 'email', 'manager@factory.com'), 'email', v_mgr_id::text, now(), now(), now()),
            (v_t1_id::text,  v_t1_id,  jsonb_build_object('sub', v_t1_id::text,  'email', 'tech1@factory.com'),   'email', v_t1_id::text,  now(), now(), now()),
            (v_t2_id::text,  v_t2_id,  jsonb_build_object('sub', v_t2_id::text,  'email', 'tech2@factory.com'),   'email', v_t2_id::text,  now(), now(), now()),
            (v_t3_id::text,  v_t3_id,  jsonb_build_object('sub', v_t3_id::text,  'email', 'tech3@factory.com'),   'email', v_t3_id::text,  now(), now(), now()),
            (v_t4_id::text,  v_t4_id,  jsonb_build_object('sub', v_t4_id::text,  'email', 'tech4@factory.com'),   'email', v_t4_id::text,  now(), now(), now())
        ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

END $$;
