# DAIMA Health Managing System

A hospital management platform covering reception, triage, consultation, laboratory, imaging, pharmacy, billing, appointments, analytics, audit, backups and a patient portal. Every department works from one patient record.

Built with Next.js 16, React 19, Tailwind CSS 4, Supabase (Postgres, Auth, Storage) and Recharts.

## Setup

### 1. Environment

Create `.env.local` in this folder. Use `.env.local.example` as the template; the values come from Supabase → Project Settings → API.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon or publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role or secret key. Server only, never commit it. |
| `CRON_SECRET` | Any long random string |
| `NEXT_PUBLIC_TZ` | Optional. Hospital time zone, default `Africa/Nairobi`. |
| `ANDROID_CERT_SHA256` | Optional. Android signing key fingerprint, see [Mobile apps](#mobile-apps). |

### 2. Database

In the Supabase **SQL Editor**, run these files in order. Run each one once, as a whole.

1. `supabase/migrations/001_schema.sql`: tables, security policies, business logic, storage buckets
2. `supabase/migrations/002_seed.sql`: symptoms and conditions, lab tests, imaging procedures, starter medicine stock
3. `supabase/migrations/003_analytics.sql`: analytics and stock-alert functions
4. `supabase/migrations/004_booking_requests.sql`: online appointment requests from the public booking page

### 3. First administrator

1. Supabase → **Authentication → Users → Add user**. Enter your email and a password, and tick *Auto confirm*.
2. In the SQL Editor:
   ```sql
   update profiles set role = 'system_admin', full_name = 'Your Name' where email = 'you@example.com';
   ```
3. Run the app and sign in through **System Administration**. Then create staff accounts in **Staff & Users**.

### 4. Run

```bash
npm install
npm run dev          # http://localhost:3000
```

## Mobile apps

The website is the app. The phone versions open the same live site full screen, so there is nothing extra to update when the site changes.

| Platform | How people get it |
|---|---|
| Web | Open the site in any browser. |
| Android | Download `daima-health.apk` from the download page or the banner in the app. Built by `.github/workflows/android.yml` from `android/` and attached to the newest GitHub release. |
| iPhone / iPad | The app shows an "Add to Home Screen" guide when opened in Safari. |

The download page lives in `site/` and is published to https://immanuellangat.github.io/daima-hms/ by `.github/workflows/pages.yml`.

**One-time setup on GitHub**

1. Settings → Secrets and variables → Actions → **Variables** → add `APP_URL` = the live site, e.g. `https://daima-hms.vercel.app/`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Actions → run **Android APK** and **Download page** once (Run workflow).

**Optional: permanent Android signing key.** Without one, each APK is signed with a throwaway key, so people must uninstall the old app before installing a new version, and the app shows a thin address bar. To fix both, add the secrets `ANDROID_KEYSTORE_BASE64` (a base64 PKCS#12 keystore), `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`. Then copy the SHA-256 fingerprint from the build summary into the website's `ANDROID_CERT_SHA256` environment variable, which `/.well-known/assetlinks.json` serves.

## How a visit flows

```
Reception ─► Triage ─► Consultation ─┬─► Laboratory ─┐
 (Patient ID,  (vitals,   (symptoms,   ├─► Imaging ────┼─► back to doctor with results
  fee paid)    history)   diagnosis)   │               │
                                       └─► Pharmacy ───► Billing ─► Completed
```

- Patient IDs are generated in the database as `<initials>-000001`. The initials are set in Settings.
- Prices for consultations, tests, scans and drugs are taken from the catalogue in the database, so clients cannot change them.
- Dispensing deducts stock first-expiry-first-out and logs every movement.
- One invoice per visit combines all charges. Supported payment methods: cash, mobile money, bank transfer, insurance, debit card and credit card.

## Online booking

The **Book an appointment** button on the home page opens `/book`:

- **Patients with a portal account** sign in and book directly into a doctor’s free slots.
- **New patients, or anyone without an account,** send a request with their name, phone, preferred doctor and time. They get a reference number such as `REQ-00012`.

Reception sees waiting requests under **Appointments → Booking requests**. Confirming one books a normal appointment, and registers the patient (name, phone, age, gender) if they are new. Declining records an optional reason. A request only holds a preferred time, so it never blocks a slot.

Requests can only be created through the `request_appointment` database function, which validates the input and limits each phone number to 3 waiting requests. Signed-out visitors cannot read any requests.

## Roles and portals

Each department signs in at `/login/<portal>`, and a portal only accepts accounts with the matching role.

| Portal | Role | Can do |
|---|---|---|
| reception | Receptionist | Register patients, start visits, take payments, book appointments |
| nurse | Nurse | Triage vitals and history. Read-only access to records. |
| doctor | Doctor | Consult, diagnose, prescribe, request tests and scans, refer |
| laboratory | Lab technician | Lab results; imaging scheduling, uploads and reports |
| pharmacy | Pharmacist | Dispense, manage inventory |
| accounts | Accountant | Invoices, payments, receipts |
| admin | Hospital admin | Analytics, stock, audit trail, settings |
| system | System admin | Everything above, plus user accounts and restore |
| patient | Patient | Own visits, results, prescriptions, invoices, appointments |

These permissions are enforced in Postgres through row-level security and triggers, not only in the UI. For example, nurses cannot write diagnoses, lab technicians cannot change prices or billing, doctors cannot see invoices, and patients see only their own records.

## Decision support (no AI)

Every insight is rule-based or statistical, and staff always make the final decision.

- **Symptom checklist:** suggests related conditions from a weighted symptom → condition table.
- **Patient risk alerts:** abnormal vital signs, and drug-allergy conflicts. A conflict blocks the prescription unless the doctor gives an override reason.
- **Disease trends:** compares the last 4 weeks with the previous 4, and projects next week with a straight-line fit.
- **Medicine demand forecast:** weighted 30/60/90-day usage, projected 30-day demand, and a restock quantity (demand plus a 15% buffer).
- **No-show risk:** based on the patient's attendance history, how far ahead the appointment was booked, and the time slot.
- **Planning summary:** automatic written summaries of the period's figures.

## Scheduled worker

`GET /api/cron/daily` with the header `Authorization: Bearer $CRON_SECRET` does four things:

1. Queues appointment reminders.
2. Sends low-stock and expiry alerts.
3. Delivers queued SMS and email.
4. Runs the daily cloud backup.

On Vercel, `vercel.json` schedules it automatically. On other hosts, call it from any cron service.

- **SMS:** set `SMS_WEBHOOK_URL`, and optionally `SMS_API_KEY`. The endpoint receives `POST {"to", "message"}`, so you can point it at Africa's Talking, Twilio, or a relay.
- **Email:** set `RESEND_API_KEY` and `EMAIL_FROM`.
- Without these settings, messages stay queued and patients still see them in the portal.

## Backups

- **Cloud:** JSON backups stored in the private `backups` storage bucket. These run automatically every day and can also be started manually.
- **Local:** *Download local copy* on the Backups page.
- **Restore** (System admin only): re-applies every record from a backup and keeps records created after it. Counters such as Patient ID and invoice numbers are moved past the restored values. Login accounts are managed by Supabase Auth and are not part of the backup.

## Security notes

- Supabase encrypts data at rest and in transit (TLS). Medical images are kept in a private bucket and served through 10-minute signed links.
- The audit trail records every insert, update and delete on clinical and financial tables, each time a patient file is opened, and logins, backups and restores.
- Security headers include HSTS, `X-Frame-Options: DENY` and `nosniff`.
- For compliance with HIPAA or Kenya's Data Protection Act you will also need organisational measures: policies, staff training, a data processing agreement with Supabase, and choice of data region. Software alone does not certify compliance.

## Images

Photos are from Unsplash, under the Unsplash License. Replace the files in `public/images/` with your own if you prefer.
