# Gloss & Grace — setup notes

This repository previously contained the LUXENAILS AI support desk. The public frontend has now been replaced with a customer-facing Gloss & Grace salon website; the existing backend files are preserved.

## Frontend
- Root directory for frontend: `frontend/`
- Install: `npm install`
- Build: `npm run build`
- Local preview: `npm run dev`
- Vite + React + TypeScript + React Router + Tailwind CSS + Lucide icons.

The public pages include Home, Services & Pricing (18 services), Booking, Gallery with filters/lightbox, Team, Offers, Journal, About, Contact, My Bookings, and a staff dashboard preview.

## Supabase connection
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql` from this repository.
3. In the frontend build environment, configure:
   - `VITE_SUPABASE_URL` = project URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase publishable/anon key only
4. Rebuild the frontend.

The booking form calls the Postgres RPC `book_appointment`. The function validates the service, serializes booking requests and rejects overlapping appointment times in the database. After a successful database booking, the frontend calls the `booking-confirmation` Edge Function to send a request receipt through Brevo. The browser-only fallback is for preview/demo only and is stored in localStorage; it is not shared between devices and cannot prevent cross-device double bookings. The success screen also provides a downloadable `.ics` calendar event and a WhatsApp link the customer opens manually.

## Still required before a real launch
- Configure the studio's actual address, contact details, local timezone, opening hours, holidays, and appointment policy.
- Configure Supabase Auth, create admin/staff users, and set their `profiles.role` securely. Never let a public client promote its own role.
- Create a Supabase Auth user for the studio owner, then insert a matching `profiles` row with role `admin` from the SQL Editor (use that user's Auth UUID). Create staff profiles similarly with the `staff` role. Never allow users to self-assign roles.
- Add an authenticated staff UI backed by the protected appointments policies; the current `/admin` page is a local demo preview only and is not a production admin system. `My Bookings` is also a local-browser demo; it does not yet retrieve live appointments from Supabase.
- Deploy the included Edge Function: `supabase functions deploy booking-confirmation`.
- In Supabase Dashboard → Edge Functions → Secrets (or via the Supabase CLI), configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and optionally `BREVO_SENDER_NAME`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. The Brevo sender address must be verified in Brevo. Never place the Brevo key in a `VITE_*` variable.
- The Edge Function sends an email receipt for the request, not a guarantee that the appointment is confirmed. Scheduled reminder emails/WhatsApp messages are not configured.
- Configure a scheduled server-side reminder job if email/calendar reminders are required. The current success screen offers a WhatsApp link the customer can open manually; it does not send scheduled WhatsApp messages.
- Wire the contact form, reviews, newsletter, gift cards, and blog to secure server/database handlers before collecting real customer data.
- Add tests, monitoring, backups, privacy/consent text, and accessibility checks before production use.

## Secret hygiene
Only the Supabase public anon/publishable key belongs in the frontend. Never use a Supabase service-role key, database password, or Brevo API key in a `VITE_*` variable or commit one to GitHub. Revoke any API key that has been pasted into a chat or committed to the repository.
