# MTN MoMo sandbox functions

The `mtn-checkout` function requires a valid Supabase user JWT. The
`mtn-payment-callback` function is public so the provider can reach it; it
ignores callback status fields and verifies each reference with MTN before
the database finalizer can grant course enrollment.

Configure these values as **Supabase Edge Function secrets** in the sandbox
project only. This repository intentionally contains no values:

- `MTN_COLLECTION_SUBSCRIPTION_KEY`: Collection product subscription key.
- `MTN_API_USER`: sandbox API user UUID provisioned for the Collection product.
- `MTN_API_KEY`: API key generated for that sandbox API user.
- `MTN_TARGET_ENVIRONMENT`: exactly `sandbox`.
- `MTN_BASE_URL`: exactly `https://sandbox.momodeveloper.mtn.com` for this
  implementation.
- `MTN_CALLBACK_BASE_URL`: HTTPS callback base. With Supabase, use the
  project's Edge Function base ending in `/functions/v1`; the request adds
  `/mtn-payment-callback`.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to the Edge Function runtime. The service-role key
is read only by server code and must never be added to frontend variables.

Before sandbox use, provision the API user with the callback host allowed by
the current MTN portal requirements and ensure it matches the callback base.
The function sends `X-Callback-Url` for RequestToPay and also supports
authenticated status rechecks through MTN. Before production, complete MTN
production onboarding and confirm its callback transport, host registration,
TLS, and API credential requirements. This code deliberately rejects
production target environments and hosts.

The phone number exists only in request memory while making RequestToPay;
only a masked form is stored. No MoMo PIN, token, or credential is logged or
stored in application tables.

The current sandbox checkout keeps course pricing in UGX and sends the same
integer amount with provider currency EUR, as required by this MTN sandbox
configuration. Production provider terms must instead match the business
amount/currency after production onboarding. The database stores both values
separately; provider terms are internal and are not exposed as course pricing.

Checkout CORS currently allows any origin for local/sandbox use. Bearer JWT
verification remains mandatory in the function. Before production, restrict
the allowed origin to the approved Uncle Bashi web domains. Status polling
currently retries about every five seconds (eight seconds after errors) and
acquires a token for each check; this can create frequent MTN calls, so review
the polling interval and consider a safe in-memory token cache before launch.
