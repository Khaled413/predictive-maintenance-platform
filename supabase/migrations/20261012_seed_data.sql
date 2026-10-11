-- ==============================================================================
-- Migration: 20261012_seed_data.sql
-- Description: Seed Roles, 27 Permissions, RBAC Matrix, and Initial Machine Fleet
-- ==============================================================================

-- 1. Seed Roles
INSERT INTO public.roles (id, name, description)
VALUES
    ('admin', 'Admin', 'Plant Administrator with full user management, security audit oversight, and system configuration authority.'),
    ('manager', 'Maintenance Manager', 'Maintenance operations manager coordinating technician schedules, plant fleet, and work orders.'),
    ('technician', 'Technician', 'Reliability technician performing work on explicitly assigned industrial machines and work orders.')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 2. Seed 27 Dot-Notation Permissions
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

-- 3. Seed Role-Permissions Matrix (Deny by default)
-- Admin: All capabilities
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'admin', id FROM public.permissions
ON CONFLICT DO NOTHING;

-- Maintenance Manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'manager', id FROM public.permissions
WHERE key IN (
    'dashboard.view',
    'machines.read',
    'machines.create',
    'machines.update',
    'machines.assign',
    'alerts.read',
    'alerts.update',
    'maintenance.read',
    'maintenance.create',
    'maintenance.assign',
    'maintenance.update',
    'maintenance.complete',
    'reports.read',
    'reports.export',
    'models.read',
    'assistant.use'
)
ON CONFLICT DO NOTHING;

-- Technician
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'technician', id FROM public.permissions
WHERE key IN (
    'dashboard.view',
    'machines.read',
    'alerts.read',
    'alerts.update',
    'maintenance.read',
    'maintenance.update',
    'maintenance.complete',
    'reports.read',
    'assistant.use'
)
ON CONFLICT DO NOTHING;

-- 4. Seed Initial Fleet Machinery
INSERT INTO public.machines (id, name, type, status, health_score, failure_risk, location, manufacturer, model, last_maintenance, next_maintenance)
VALUES
    ('M-001', 'CNC Milling Station Alpha', 'CNC Milling Machine', 'Operational', 94.0, 6.0, 'Bay A - Line 1', 'Siemens Precision', 'Sinumerik 840D', now() - interval '14 days', now() + interval '16 days'),
    ('M-002', 'High-Torque Hydraulic Press 02', 'Hydraulic Press', 'Warning', 68.0, 32.0, 'Bay A - Line 1', 'Bosch Rexroth', 'CytroBox 250', now() - interval '30 days', now() + interval '2 days'),
    ('M-003', 'Centrifugal Cooling Pump C3', 'Industrial Pump', 'Operational', 88.0, 12.0, 'Bay B - Line 1', 'Grundfos', 'CR-95 HighFlow', now() - interval '45 days', now() + interval '10 days'),
    ('M-004', 'Robotic Welding Arm Beta', 'Robotic Arm', 'Operational', 91.0, 9.0, 'Bay C - Line 2', 'KUKA Automation', 'KR QUANTEC 210', now() - interval '20 days', now() + interval '25 days'),
    ('M-005', 'Twin-Screw Air Compressor 05', 'Air Compressor', 'Critical', 34.0, 66.0, 'Utility Plant - Line 2', 'Atlas Copco', 'GA 90 VSD+', now() - interval '60 days', now() - interval '5 days'),
    ('M-006', 'Heavy Conveyor Drive Unit 06', 'Conveyor System', 'Operational', 85.0, 15.0, 'Bay D - Line 2', 'SEW-Eurodrive', 'Movitrac B Series', now() - interval '10 days', now() + interval '20 days')
ON CONFLICT (id) DO NOTHING;

-- 5. Seed Initial Alerts
INSERT INTO public.alerts (id, machine_id, type, severity, message, status, recommended_action)
VALUES
    ('ALT-001', 'M-005', 'ML Failure Risk', 'critical', 'Model estimates 66.0% failure probability due to Heat Dissipation Failure (HDF).', 'active', 'Inspect oil cooler radiator and verify thermal jacket flow.'),
    ('ALT-002', 'M-002', 'Bearing Vibration Anomaly', 'warning', 'Drive shaft RMS vibration exceeded 4.5 mm/s baseline threshold.', 'active', 'Lubricate journal bearing and inspect balance weights.'),
    ('ALT-003', 'M-003', 'Pressure Drop Warning', 'warning', 'Impeller outlet differential pressure dropped 12% below nominal.', 'acknowledged', 'Check suction strainer for particulate clogging.')
ON CONFLICT (id) DO NOTHING;
