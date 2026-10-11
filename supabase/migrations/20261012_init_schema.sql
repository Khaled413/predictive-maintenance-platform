-- ==============================================================================
-- Migration: 20261012_init_schema.sql
-- Description: Core Schema, RBAC, Operational Tables, and Row Level Security (RLS)
-- Platform: Predictive Maintenance Platform (Enterprise Industrial AI SaaS)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Permissions Table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Role Permissions Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

-- 4. User Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role_id TEXT NOT NULL REFERENCES public.roles(id) DEFAULT 'technician',
    department TEXT,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'deactivated')),
    avatar_initials TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Equipment Fleet (Machines) Table
CREATE TABLE IF NOT EXISTS public.machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'Operational',
    health_score NUMERIC(5,2) DEFAULT 95.0,
    failure_risk NUMERIC(5,2) DEFAULT 5.0,
    location TEXT,
    manufacturer TEXT,
    model TEXT,
    last_maintenance TIMESTAMPTZ,
    next_maintenance TIMESTAMPTZ,
    sensors JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Operational Machine Assignments Table
CREATE TABLE IF NOT EXISTS public.machine_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active', 'inactive')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    CONSTRAINT unique_active_machine_user_assignment UNIQUE (machine_id, user_id, assignment_status)
);

-- 7. Maintenance Orders Table
CREATE TABLE IF NOT EXISTS public.maintenance_orders (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Recommended', 'Scheduled', 'In Progress', 'Completed', 'Cancelled')),
    technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    technician_name TEXT,
    downtime TEXT,
    cost NUMERIC(10,2),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Industrial Alerts Table
CREATE TABLE IF NOT EXISTS public.alerts (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info', 'success')),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
    recommended_action TEXT,
    acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- 9. Security Audit Logs Table (Append-Only)
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

-- ==============================================================================
-- Security Definier Helper Functions
-- ==============================================================================

-- Get current authenticated user's role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role_id FROM public.profiles WHERE id = auth.uid() AND account_status = 'active';
$$;

-- Check if current user is active Admin
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

-- Check if current user is active Manager or Admin
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

-- Check if current user has a specific permission
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

-- Check if current user is assigned to a specific machine
CREATE OR REPLACE FUNCTION public.is_assigned_to_machine(p_machine_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.machine_assignments
        WHERE machine_id = p_machine_id
          AND user_id = auth.uid()
          AND assignment_status = 'active'
    );
$$;

-- Automatic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_machines_updated_at ON public.machines;
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON public.machines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_orders_updated_at ON public.maintenance_orders;
CREATE TRIGGER trg_maintenance_orders_updated_at BEFORE UPDATE ON public.maintenance_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Automatically provision profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    default_role TEXT := 'technician';
    user_full_name TEXT;
BEGIN
    -- Read metadata if provided, otherwise fallback
    user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
    
    -- Extract desired initial role if requested by trusted bootstrap
    IF NEW.raw_user_meta_data->>'role' IN ('admin', 'manager', 'technician') THEN
        default_role := NEW.raw_user_meta_data->>'role';
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
        default_role,
        'active',
        UPPER(SUBSTRING(user_full_name FROM 1 FOR 2)),
        COALESCE(NEW.raw_user_meta_data->>'department', 'Operations')
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- Row Level Security (RLS) Policies — Default Deny
-- ==============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Roles & Permissions: Read-only for authenticated, manageable by Admin
CREATE POLICY "Authenticated users can read roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON public.roles FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Authenticated users can read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Authenticated users can read role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL TO authenticated USING (public.is_admin());

-- 2. Profiles: Users read all active profiles in factory, Admins manage all
CREATE POLICY "Authenticated users can view active profiles" ON public.profiles FOR SELECT TO authenticated USING (account_status = 'active' OR public.is_admin());
CREATE POLICY "Users can update their own profile fields" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

-- 3. Machines:
-- Admins and Managers read all machines.
-- Technicians read ONLY machines assigned to them via machine_assignments!
CREATE POLICY "Admins and Managers can view all machines" ON public.machines FOR SELECT TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Technicians view assigned machines only" ON public.machines FOR SELECT TO authenticated USING (public.is_assigned_to_machine(id));
CREATE POLICY "Admins can create machines" ON public.machines FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins and Managers can update machines" ON public.machines FOR UPDATE TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Admins can delete machines" ON public.machines FOR DELETE TO authenticated USING (public.is_admin());

-- 4. Machine Assignments:
CREATE POLICY "Admins and Managers can view all machine assignments" ON public.machine_assignments FOR SELECT TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Technicians view their own machine assignments" ON public.machine_assignments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins and Managers can manage assignments" ON public.machine_assignments FOR ALL TO authenticated USING (public.is_manager_or_admin());

-- 5. Maintenance Orders:
-- Admins and Managers view and create all orders.
-- Technicians view orders assigned to them or on their assigned machines.
CREATE POLICY "Admins and Managers view all maintenance orders" ON public.maintenance_orders FOR SELECT TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Technicians view assigned maintenance orders" ON public.maintenance_orders FOR SELECT TO authenticated USING (
    technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id)
);
CREATE POLICY "Admins and Managers can create maintenance orders" ON public.maintenance_orders FOR INSERT TO authenticated WITH CHECK (public.is_manager_or_admin());
CREATE POLICY "Admins and Managers can update maintenance orders" ON public.maintenance_orders FOR UPDATE TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Technicians can update their assigned maintenance orders" ON public.maintenance_orders FOR UPDATE TO authenticated USING (
    technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id)
) WITH CHECK (
    technician_id = auth.uid() OR public.is_assigned_to_machine(machine_id)
);
CREATE POLICY "Admins can delete maintenance orders" ON public.maintenance_orders FOR DELETE TO authenticated USING (public.is_admin());

-- 6. Alerts:
CREATE POLICY "Admins and Managers view all alerts" ON public.alerts FOR SELECT TO authenticated USING (public.is_manager_or_admin());
CREATE POLICY "Technicians view alerts for assigned machines" ON public.alerts FOR SELECT TO authenticated USING (public.is_assigned_to_machine(machine_id));
CREATE POLICY "Admins and Managers can insert alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.is_manager_or_admin());
CREATE POLICY "Authenticated users can update accessible alerts" ON public.alerts FOR UPDATE TO authenticated USING (
    public.is_manager_or_admin() OR public.is_assigned_to_machine(machine_id)
);

-- 7. Audit Logs: Append-Only security guarantees!
-- SELECT: Admins only.
-- INSERT: Any authenticated actor or trigger.
-- UPDATE / DELETE: Prohibited for ALL roles!
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Authenticated users can append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
