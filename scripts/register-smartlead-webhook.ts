/**
 * Register a webhook with SmartLead to receive reply notifications.
 *
 * Usage:
 *   npx tsx scripts/register-smartlead-webhook.ts
 *
 * Required env vars:
 *   SMARTLEAD_API_KEY
 *   SMARTLEAD_CAMPAIGN_ID (or pass as CLI arg)
 *   SUPABASE_URL (for building the webhook URL)
 */

const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY || "62c843bb-90af-4841-9a52-ea24d1b8ae6a_xi1qomd";
const SMARTLEAD_CAMPAIGN_ID = process.env.SMARTLEAD_CAMPAIGN_ID || process.argv[2] || "3024388";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://wuepkorqdnabfxtynytf.supabase.co";

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook-smartlead-reply`;

async function registerWebhook() {
  console.log(`Registering SmartLead webhook for campaign ${SMARTLEAD_CAMPAIGN_ID}`);
  console.log(`Webhook URL: ${WEBHOOK_URL}`);

  const resp = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/webhooks?api_key=${SMARTLEAD_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ReplyPilot - Reply Ingestion",
        webhook_url: WEBHOOK_URL,
        event_types: ["EMAIL_REPLY"],
      }),
    }
  );

  const data = await resp.json();

  if (resp.ok) {
    console.log("Webhook registered successfully:", JSON.stringify(data, null, 2));
  } else {
    console.error(`Failed to register webhook (${resp.status}):`, JSON.stringify(data, null, 2));
    process.exit(1);
  }
}

// Also list existing webhooks for visibility
async function listWebhooks() {
  const resp = await fetch(
    `https://server.smartlead.ai/api/v1/campaigns/${SMARTLEAD_CAMPAIGN_ID}/webhooks?api_key=${SMARTLEAD_API_KEY}`
  );
  const data = await resp.json();
  console.log("\nExisting webhooks:", JSON.stringify(data, null, 2));
}

async function main() {
  await listWebhooks();
  console.log("\n---\n");
  await registerWebhook();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
