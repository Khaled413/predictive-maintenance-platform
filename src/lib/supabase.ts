import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
      }
      permissions: {
        Row: {
          id: string
          key: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          description?: string | null
          created_at?: string
        }
      }
      role_permissions: {
        Row: {
          role_id: string
          permission_id: string
          created_at: string
        }
        Insert: {
          role_id: string
          permission_id: string
          created_at?: string
        }
        Update: {
          role_id?: string
          permission_id?: string
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          role_id: string
          department: string | null
          account_status: 'active' | 'deactivated'
          avatar_initials: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          role_id?: string
          department?: string | null
          account_status?: 'active' | 'deactivated'
          avatar_initials?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          role_id?: string
          department?: string | null
          account_status?: 'active' | 'deactivated'
          avatar_initials?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      machines: {
        Row: {
          id: string
          name: string
          type: string
          status: string | null
          health_score: number | null
          failure_risk: number | null
          location: string | null
          manufacturer: string | null
          model: string | null
          last_maintenance: string | null
          next_maintenance: string | null
          sensors: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          type: string
          status?: string | null
          health_score?: number | null
          failure_risk?: number | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          last_maintenance?: string | null
          next_maintenance?: string | null
          sensors?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          status?: string | null
          health_score?: number | null
          failure_risk?: number | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          last_maintenance?: string | null
          next_maintenance?: string | null
          sensors?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      machine_assignments: {
        Row: {
          id: string
          machine_id: string
          user_id: string
          assigned_by: string | null
          assignment_status: string
          assigned_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          user_id: string
          assigned_by?: string | null
          assignment_status?: string
          assigned_at?: string
          ended_at?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          user_id?: string
          assigned_by?: string | null
          assignment_status?: string
          assigned_at?: string
          ended_at?: string | null
        }
      }
      maintenance_orders: {
        Row: {
          id: string
          machine_id: string
          title: string
          description: string | null
          priority: string
          status: string
          technician_id: string | null
          technician_name: string | null
          downtime: string | null
          cost: number | null
          created_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          machine_id: string
          title: string
          description?: string | null
          priority: string
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          downtime?: string | null
          cost?: number | null
          created_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          machine_id?: string
          title?: string
          description?: string | null
          priority?: string
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          downtime?: string | null
          cost?: number | null
          created_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      alerts: {
        Row: {
          id: string
          machine_id: string
          type: string
          severity: string
          message: string
          status: string
          recommended_action: string | null
          acknowledged_by: string | null
          created_at: string
          resolved_at: string | null
        }
        Insert: {
          id: string
          machine_id: string
          type: string
          severity: string
          message: string
          status?: string
          recommended_action?: string | null
          acknowledged_by?: string | null
          created_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          type?: string
          severity?: string
          message?: string
          status?: string
          recommended_action?: string | null
          acknowledged_by?: string | null
          created_at?: string
          resolved_at?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          action: string
          resource_type: string
          resource_id: string | null
          outcome: string
          details: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          outcome: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          outcome?: string
          details?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
    }
  }
}

const procEnv = (globalThis as any)?.process?.env

const supabaseUrl: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  procEnv?.VITE_SUPABASE_URL ||
  procEnv?.SUPABASE_URL ||
  'https://tdlaaykvhuyecjupqoau.supabase.co'

const supabaseAnonKey: string =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_ANON_KEY ||
      import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
  procEnv?.VITE_SUPABASE_ANON_KEY ||
  procEnv?.SUPABASE_ANON_KEY ||
  'sb_publishable_eyUw9szBPSLfytfpgMLSKQ_zHTBTeNY'

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('placeholder')
)

export const supabase: SupabaseClient<any> | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function getSupabase(): SupabaseClient<any> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    )
  }
  return supabase
}
