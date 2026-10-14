// Supabase Edge Function: invite-user
// Privileged administrative endpoint for inviting users with assigned role and operational machine scope.
// Invoked by Admin users only. Protected by caller JWT validation.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = req.headers.get('Authorization')

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Create client with caller's JWT to verify identity and role
    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    )

    const {
      data: { user: callerUser },
      error: callerAuthError,
    } = await callerClient.auth.getUser()

    if (callerAuthError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Invalid authentication session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Verify caller has admin role via public.profiles
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role_id, account_status')
      .eq('id', callerUser.id)
      .single()

    if (
      profileError ||
      callerProfile?.role_id !== 'admin' ||
      callerProfile?.account_status !== 'active'
    ) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin authority required to invite users' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. Parse and validate payload
    const body = await req.json()
    const { email, fullName, role, department, assignedMachineIds } = body

    if (!email || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'email, fullName, and role are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!['admin', 'manager', 'technician'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role specified' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Create trusted admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Send invitation email via Supabase Auth Admin
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName,
          role: role,
          department: department || 'Plant Operations',
        },
      })

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUserId = inviteData.user.id

    // Assign machines if specified
    if (Array.isArray(assignedMachineIds) && assignedMachineIds.length > 0) {
      const assignmentRows = assignedMachineIds.map((machineId: string) => ({
        machine_id: machineId,
        user_id: newUserId,
        assigned_by: callerUser.id,
        assignment_status: 'active',
      }))

      await adminClient.from('machine_assignments').insert(assignmentRows)
    }

    // Log security audit record
    await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      actor_name: callerUser.email,
      actor_role: 'admin',
      action: 'users.invited',
      resource_type: 'user',
      resource_id: newUserId,
      outcome: 'ALLOW',
      details: `Invited user ${email} with role ${role} by Admin ${callerUser.email}`,
      metadata: { email, role, machineCount: assignedMachineIds?.length || 0 },
    })

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        message: `Invitation sent to ${email}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
