# Gloss & Grace — Nail Studio Website

A responsive customer-facing website for Gloss & Grace, a premium nail studio. Built with React, Vite, TypeScript, React Router, Tailwind CSS, and Lucide icons.

> The original LUXENAILS AI customer-support backend remains in `backend/`. The frontend in `frontend/` is now the Gloss & Grace public salon website.

## What is included

- Luxury blush, rose, cream and plum visual design with responsive mobile navigation
- Home, Services & Pricing, Booking, Gallery, Team, Offers, Journal, About, Contact, My Bookings, and 404 pages
- 18 nail services with prices, categories, durations, and search/filter controls
- Appointment request form, time selection, overlap checking, success state, downloadable calendar event, and WhatsApp follow-up link
- Gallery filters and image lightbox
- Newsletter demo storage, offer cards, reviews/testimonial styling, SEO metadata, favicon, reduced-motion support
- Supabase schema with Row Level Security and a database-side booking RPC that rejects overlapping appointment requests
- Supabase Edge Function for appointment request email receipts through Brevo
- GitHub Actions frontend build check

## Run the frontend

Requires Node.js 20 or newer.

```bash
cd frontend
npm ci
npm run dev
```

Build it:

```bash
npm run build
```

The frontend can render without Supabase credentials, but booking and newsletter data will use browser-only demo behavior. Browser-only data is not shared between devices and is not appropriate for a live multi-user booking system.

## Configure Supabase for shared bookings

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.
3. Copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and public anon/publishable key.
4. Restart the frontend after changing environment variables.
5. Deploy the booking email function and configure the Brevo secrets (instructions in [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)).

Only a public Supabase anon/publishable key belongs in browser environment variables. Never expose the Supabase service-role key, database password, or Brevo API key in the frontend or Git history.

## Important production setup still required

- Confirm the real studio address, timezone, opening hours, holiday schedule, phone and social links.
- Configure Supabase Auth and assign staff/admin roles securely.
- Build the production authenticated admin dashboard and secure customer booking lookup; the current `/admin` and `/my-bookings` pages are explicitly demo-only.
- Set up scheduled reminders if you need automatic email or WhatsApp reminders. The calendar file and WhatsApp link are manual customer actions.
- Connect contact form, newsletter, reviews, blog and gift cards to server/database handlers before collecting real customer data.
- Test booking conflicts, security policies, accessibility, privacy disclosures, monitoring and backups before launch.

## Files

- `frontend/` — Gloss & Grace public website
- `supabase/schema.sql` — database tables, RLS policies, seeded services, and atomic booking RPC
- `supabase/functions/booking-confirmation/index.ts` — server-side email receipt function
- `SUPABASE_SETUP.md` — detailed setup and production checklist
- `backend/` — original LUXENAILS AI customer-support API, retained from the prior project
https://pratigyap9955.github.io/luxenails-support-desk/
