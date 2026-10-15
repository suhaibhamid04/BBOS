# Meta WhatsApp Cloud API setup

BBOS sends one-to-one WhatsApp messages through Meta's Cloud API. Demo Mode uses an explicit mock provider; production fails closed until every required server secret is configured.

## Meta prerequisites

1. Create or select a Meta business portfolio and Meta developer app with the WhatsApp product.
2. Connect the WhatsApp Business Account and production phone number. Record the WhatsApp Business Account ID and Phone Number ID.
3. Create a production system-user access token with the WhatsApp messaging permissions required by the app. Do not use a short-lived browser token in production.
4. Configure the callback URL as `https://YOUR_BBOS_HOST/api/public/meta-whatsapp/webhook` and choose a private verification token.
5. Subscribe the WhatsApp Business Account webhook to the `messages` field. BBOS consumes text messages and message status updates from that subscription.
6. Keep the Meta App Secret available to BBOS. POST webhooks are rejected unless `X-Hub-Signature-256` validates against the exact raw request body.
7. Create and obtain approval for any templates needed to start or resume conversations outside the customer-service window. Add only those exact names/languages to the BBOS allowlist.

## Server environment

Configure these only in the server secret manager/runtime environment:

```text
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID
META_WHATSAPP_BUSINESS_ACCOUNT_ID
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
META_WHATSAPP_APP_SECRET
META_WHATSAPP_GRAPH_API_VERSION
META_WHATSAPP_APPROVED_TEMPLATES
```

`META_WHATSAPP_APPROVED_TEMPLATES` is a JSON array:

```json
[
  {
    "name": "kashmir_package_ready",
    "label": "Kashmir package ready",
    "languageCode": "en_US"
  }
]
```

Never expose these values through `VITE_` variables or browser configuration. Set `META_WHATSAPP_GRAPH_API_VERSION` to the currently supported version selected for your Meta app, pin it, and deliberately update it only after testing Meta version changes.

## Activation check

1. Deploy the Firestore rules and indexes with the application.
2. Complete Meta's GET webhook verification.
3. Send an inbound test message from an approved test recipient.
4. Confirm it appears on the correct Lead, then reply from BBOS.
5. Confirm the message advances through Sent, Delivered, and Read when Meta emits those receipts.
6. Confirm an unknown number appears under Unmatched WhatsApp instead of being attached to a guessed Lead.

BBOS stores provider-confirmed history immutably. It does not auto-send, broadcast, run campaigns, or send AI-generated replies.
