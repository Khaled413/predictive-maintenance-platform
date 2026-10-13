# n8n Machine Fault Alert Workflow Integration

This directory contains the n8n automation workflow template for real-time industrial machinery fault dispatching to Telegram.

## Files
- `machine_fault_alert_workflow.json`: Ready-to-import n8n workflow definition.

## Architecture & Integration
1. **Source:** Predictive Maintenance Platform frontend (`src/utils/faultWebhook.ts`).
2. **Trigger:** When any industrial machine enters a fault state (`Critical` or `Warning`), `notifyFaultTransitions()` dispatches an HTTP POST payload to `VITE_N8N_WEBHOOK_URL`.
3. **Dispatch:** The n8n workflow parses the fault severity, failure classification probability, machine ID, and department name, and sends targeted Telegram notifications to the corresponding on-duty maintenance engineers.

## How to Import
1. Open your self-hosted or cloud **n8n** workspace.
2. Click **Add workflow** ➔ **Import from File...**
3. Select `machine_fault_alert_workflow.json`.
4. Configure your Telegram Bot Token and Chat IDs in the workflow parameters.
5. Copy the Production or Test Webhook URL and set it in your `.env` file:
   ```env
   VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/machine-fault
   VITE_N8N_NOTIFY_WARNINGS=false
   ```
