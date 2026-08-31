/**
 * Demo data for LUXENAILS.
 *
 * Produces a support desk that looks like a live Tuesday afternoon: tickets at
 * every workflow stage, SLA clocks in all three states, real escalations with
 * Slack alerts, approved and pending AI drafts, and a knowledge base that the
 * RAG index is built from.
 *
 * Idempotent — re-running wipes the demo rows and rebuilds them.
 */

import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { chunkText, embed } from "../src/services/embedding.service";
import { demoDraftReply, demoTriage } from "../src/services/demo-engine";
import { searchKnowledge } from "../src/services/rag.service";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

// ─────────────────────────── Knowledge base ───────────────────────────

const ARTICLES = [
  {
    title: "Cancellation and rescheduling policy",
    category: "Policies",
    tags: ["cancellation", "reschedule", "deposit", "no-show"],
    summary: "48-hour window, deposit handling, and the late-cancellation fee.",
    content: `LUXENAILS holds every appointment with a deposit of £20, or £50 for bridal and group bookings. The deposit is redeemed against your treatment on the day.

You may cancel or reschedule free of charge up to 48 hours before your appointment. Your deposit is carried forward to the rescheduled date, and there is no limit on how many times a booking can be moved provided each change is made inside the 48-hour window.

Cancellations made between 24 and 48 hours before the appointment forfeit 50% of the deposit. Cancellations inside 24 hours, and no-shows, forfeit the deposit in full. This is because the slot can rarely be refilled at short notice and the technician is paid for the reserved time either way.

We waive the late-cancellation fee in three situations: documented illness, a bereavement, and any occasion where LUXENAILS has had to move your appointment in the preceding 60 days. Our client care team can apply the waiver directly — customers do not need to provide paperwork for a first request.

Diamond and Platinum members have a reduced cancellation window of 12 hours rather than 48, as part of their membership benefits.`,
  },
  {
    title: "Refunds, redos and the satisfaction guarantee",
    category: "Policies",
    tags: ["refund", "redo", "guarantee", "billing", "complaint"],
    summary: "7-day guarantee, when we redo vs. refund, and refund timings.",
    content: `Every treatment at LUXENAILS carries a 7-day satisfaction guarantee covering the integrity of the work: lifting, chipping, premature loss of an enhancement, or a finish that does not match what was agreed at consultation.

Our first remedy is always a complimentary correction with a senior technician, booked at the earliest slot that suits the client. Corrections typically take 30 to 60 minutes and there is no charge for products or time.

We issue a full refund rather than a correction when the client no longer wishes to return, when the issue involves a skin reaction or injury, or when a correction has already been attempted and has not resolved the problem. Refunds go back to the original payment method and take 3 to 5 working days to clear, though most clients see them within 48 hours. We do not require the client to return to the salon to receive a refund.

Ordinary wear after seven days is not covered by the guarantee. Gel typically wears two to three weeks and hard-gel or acrylic enhancements three to four weeks before an infill is needed.

Any report of skin irritation, an allergic reaction, infection or injury is escalated to the salon director on the day it is received, regardless of how long ago the treatment took place.`,
  },
  {
    title: "Service menu, durations and pricing",
    category: "Services",
    tags: ["pricing", "cost", "services", "gel", "acrylic", "biab", "pedicure"],
    summary: "What each treatment costs, how long it takes, and what is included.",
    content: `Classic manicure — £38, 45 minutes. Shaping, cuticle work, buffing, hand massage and a regular polish finish.

Gel manicure — £52, 60 minutes. As the classic manicure with a soak-off gel colour that lasts two to three weeks. Removal of existing LUXENAILS gel is included; removal of another salon's work is £12.

BIAB (Builder In A Bottle) — £68, 75 minutes. A flexible soft-gel overlay applied to the natural nail for strength and length retention. Infills are £52 every three to four weeks. BIAB is our most requested treatment for clients growing out damaged nails.

Acrylic full set — £75, 90 minutes. Infills £55. Recommended for significant added length or for clients who are hard on their hands.

Luxury pedicure — £65, 75 minutes. Soak, exfoliation, callus treatment, extended massage and polish of choice.

Nail art — from £5 per accent nail; full-set intricate designs are quoted at consultation, typically £25 to £60. Chrome, cat-eye and encapsulated finishes carry a £15 supplement.

Bridal packages start at £180 and include a trial appointment, the wedding-day set, and a complimentary removal afterwards.

Prices were last reviewed in January and are held for the calendar year. Members receive their tier discount automatically at checkout.`,
  },
  {
    title: "Aftercare — making your set last",
    category: "Aftercare",
    tags: ["aftercare", "maintenance", "lifting", "cuticle-oil", "swimming"],
    summary: "Daily care, what causes lifting, and when to come back.",
    content: `Apply cuticle oil twice daily. This is the single most effective thing a client can do: oil keeps the nail plate flexible, which stops the enhancement from lifting at the stress points. A complimentary bottle is included with every enhancement service.

Wear gloves for washing up, cleaning, and any prolonged contact with hot water or detergent. Hot water is the most common cause of early lifting because it expands the natural nail underneath a rigid product.

Avoid using your nails as tools. Opening cans, scratching labels and picking at stickers is what breaks a set, far more often than the treatment itself failing.

Swimming and hot tubs are fine after 24 hours, though chlorine will dull a glossy topcoat over time. A quick topcoat refresh in salon is £8.

Never pick or peel a lifting nail. Peeling removes layers of the natural nail plate with the product and causes the thinning and sensitivity clients often blame on the enhancement. Book a repair instead — single-nail repairs are £8 and take ten minutes.

Book infills every three to four weeks for acrylic and BIAB. Leaving an enhancement longer than five weeks moves the stress point too far from the cuticle and increases the risk of a break.`,
  },
  {
    title: "Booking, availability and walk-ins",
    category: "Booking",
    tags: ["booking", "availability", "walk-in", "waitlist", "opening-hours"],
    summary: "How to book, opening hours, waitlist, and group bookings.",
    content: `LUXENAILS is open Tuesday to Friday 10am to 8pm, Saturday 9am to 7pm, and Sunday 11am to 5pm. We are closed on Mondays.

Appointments can be booked through the website, by phone, by replying to any of our emails, or through Instagram direct message. All four routes reach the same client care team and the same diary.

We hold a small number of walk-in slots each day, released at opening. Walk-ins cannot be reserved in advance. Friday evenings and Saturdays are almost always fully booked two to three weeks ahead, so we recommend booking your next appointment before you leave the salon.

Our waitlist is genuinely active: when a cancellation comes in we contact waitlisted clients in order, and roughly one in three waitlist requests is filled within a week. Ask client care to add you to the list for a specific day or technician.

Group bookings of four or more people are arranged directly with the salon manager and require a £50 per person deposit. We can open outside normal hours for bridal parties.

Requesting a specific technician is free and never affects the price. If your preferred technician is on leave, client care will tell you before confirming rather than silently reassigning you.`,
  },
  {
    title: "Products, ingredients and allergies",
    category: "Products",
    tags: ["products", "ingredients", "vegan", "allergy", "hema", "10-free"],
    summary: "Which brands we use, what is in them, and how we handle sensitivities.",
    content: `We use OPI, The GelBottle Inc and Bio Sculpture as our core product lines, plus Footlogix for pedicure treatments. Every polish on our menu is 10-free, meaning it excludes the ten most common problem ingredients including formaldehyde, toluene, DBP and camphor.

Our entire polish range is vegan and none of our suppliers test on animals.

HEMA sensitivity is the most common reaction we see in gel clients. It typically presents as itching or redness around the cuticle after two or three services rather than immediately. We stock a full HEMA-free product line — please tell client care when booking so the technician can prepare, as it requires a different base and a longer cure.

Clients with a known acrylate allergy, latex allergy, or who are undergoing chemotherapy should mention it at booking. We do not refuse service; we adjust the products and the technique, and for chemotherapy clients we keep filing minimal and skip cuticle work entirely.

We can supply a full ingredient list for any product on request, usually the same working day.

If a client experiences any reaction, they should contact us immediately and stop using the product. Reactions are escalated to the salon director and the treatment is refunded in full.`,
  },
  {
    title: "Membership tiers and loyalty benefits",
    category: "Membership",
    tags: ["membership", "loyalty", "vip", "diamond", "platinum", "renewal"],
    summary: "What each tier costs, what it includes, and how billing works.",
    content: `LUXENAILS membership is billed monthly and can be paused for up to two months a year or cancelled with 30 days' notice. Cancellation takes effect at the end of the current billing period; we do not pro-rate part months, and any unused treatment credits stay valid for 90 days after cancellation.

Silver — £45 a month. One classic manicure included, 10% off additional treatments, standard booking window.

Gold — £85 a month. One gel manicure included, 15% off additional treatments, priority waitlist placement.

Platinum — £150 a month. Two treatments of your choice up to BIAB level, 20% off everything else, a reduced 12-hour cancellation window, and free single-nail repairs.

Diamond — £280 a month. Four treatments including any service on the menu, 25% off retail products, a dedicated technician, guaranteed same-week booking, and a direct line to the salon manager.

Tier changes take effect at the next billing date and can be requested at any time through client care. Upgrading mid-month is possible and charged pro-rata; downgrading always waits for the next cycle.

Unused included treatments roll over for one month only. They cannot be transferred between members but may be gifted to another person once per quarter with 24 hours' notice.`,
  },
  {
    title: "Gift cards and vouchers",
    category: "Policies",
    tags: ["gift-card", "voucher", "redeem", "balance", "expiry"],
    summary: "Buying, redeeming, expiry and lost-card handling.",
    content: `Gift cards can be bought in any amount from £25 upwards, either in salon or by email through client care. Digital cards are issued within minutes of payment and can be scheduled to arrive on a chosen date.

Gift cards are valid for 24 months from the date of purchase. We send a reminder email 60 days before expiry to the address the card was sent to.

Cards can be part-redeemed. The remaining balance stays on the card and can be checked at any time by replying to the original email or asking at reception.

A gift card can be used towards any service or retail product, and it can be combined with a membership discount. It cannot be exchanged for cash.

If a card is lost, we can reissue it provided the purchaser can confirm the order reference or the email address used. Balances are held against the card number in our system, so nothing is lost.

Expired cards are reinstated on request as a goodwill gesture once per customer — client care can do this without manager approval.`,
  },
  {
    title: "Handling complaints and service recovery",
    category: "Internal",
    tags: ["complaint", "escalation", "recovery", "internal", "sla"],
    summary: "Internal guidance for agents on remedy levels and escalation.",
    content: `Acknowledge first, diagnose second. A client who has had a poor experience needs to hear that we have understood the specific problem before they hear about policy. Repeat the actual issue back to them in your first sentence.

Apologise once, specifically, and only for what we actually got wrong. Repeated apologies read as insincere and make the reply longer without making it better.

Remedy ladder, in order: complimentary correction with a senior technician; correction plus a service credit; full refund; refund plus a gesture such as a complimentary treatment. Agents can authorise anything up to a full refund of the treatment value without approval.

Escalate to the shift manager when the client asks for a manager, when a second complaint arrives about the same visit, or when the remedy needed exceeds the value of the original treatment.

Escalate to the salon director immediately for any injury, skin reaction, infection, allergic reaction, threatened legal action, threatened chargeback, or a review that names an individual technician.

Never dispute the client's account of what happened in writing. If the technician's version differs, arrange a conversation in person or by phone.

Target first response is one hour during opening hours for anything marked urgent or high priority, and four hours for everything else.`,
  },
  {
    title: "Nail health, damage and repair",
    category: "Aftercare",
    tags: ["damage", "thin-nails", "repair", "breakage", "recovery"],
    summary: "What causes damage, what does not, and how we rebuild nails.",
    content: `Properly applied and properly removed enhancements do not damage the natural nail. Almost all damage we see comes from one of three things: picking a set off, over-filing during removal at another salon, or leaving an enhancement on well past the infill date.

A soak-off should never involve force. Gel and BIAB dissolve in acetone in 10 to 15 minutes; anything that has to be levered off is being removed wrongly.

Thin, flexible or sensitive nails after removal usually recover within two to three growth cycles, roughly eight to twelve weeks. Cuticle oil twice daily and a keratin-building base coat speed this up noticeably.

For clients recovering from damage we recommend BIAB rather than a bare nail. The overlay protects the nail while it grows and prevents the peeling that undoes progress.

Single-nail repairs are £8 and take about ten minutes. We would always rather see a client for a ten-minute repair than have them wait and lose the whole set.

White patches after removal are surface dehydration, not fungal infection, and resolve with oil. Genuine discoloration, thickening or separation from the nail bed should be seen by a GP or podiatrist, and we will say so rather than treating over it.`,
  },
];

// ─────────────────────────── Team ───────────────────────────

const USERS = [
  { email: "owner@luxenails.com", name: "Salon Owner", role: "ADMIN" as const, title: "Owner", avatarHue: 300 },
  { email: "amara@luxenails.com", name: "Amara Osei", role: "ADMIN" as const, title: "Salon Director", avatarHue: 330 },
  { email: "priya@luxenails.com", name: "Priya Raman", role: "MANAGER" as const, title: "Client Care Manager", avatarHue: 350 },
  { email: "sofia@luxenails.com", name: "Sofia Marchetti", role: "AGENT" as const, title: "Senior Client Care", avatarHue: 315 },
  { email: "leo@luxenails.com", name: "Leo Nakamura", role: "AGENT" as const, title: "Client Care Specialist", avatarHue: 285 },
  { email: "hannah@luxenails.com", name: "Hannah Blake", role: "AGENT" as const, title: "Client Care Specialist", avatarHue: 20 },
];

// ─────────────────────────── Customers ───────────────────────────

const CUSTOMERS = [
  { name: "Isabella Fontaine", email: "isabella.fontaine@gmail.com", phone: "+44 7700 900142", tier: "DIAMOND" as const, totalVisits: 68, lifetimeValue: 9840, preferredTech: "Sofia Marchetti", lastVisitAt: ago(6 * DAY), tags: ["bridal-2024", "gel", "vip"], notes: "Books the same Thursday 6pm slot every three weeks. Prefers almond shape, nude tones." },
  { name: "Priyanka Shah", email: "p.shah@outlook.com", phone: "+44 7700 900318", tier: "PLATINUM" as const, totalVisits: 41, lifetimeValue: 5620, preferredTech: "Leo Nakamura", lastVisitAt: ago(11 * DAY), tags: ["biab", "nail-art"], notes: "Loves chrome finishes. Sensitive cuticles — light filing only." },
  { name: "Charlotte Mbeki", email: "charlotte.mbeki@icloud.com", phone: "+44 7700 900927", tier: "PLATINUM" as const, totalVisits: 37, lifetimeValue: 4980, lastVisitAt: ago(3 * DAY), tags: ["acrylic", "long-set"], notes: "Works in hospitality — needs durable sets." },
  { name: "Aisling Byrne", email: "aisling.byrne@gmail.com", phone: "+44 7700 900455", tier: "GOLD" as const, totalVisits: 22, lifetimeValue: 2140, lastVisitAt: ago(19 * DAY), tags: ["gel"], allergies: "HEMA sensitivity — HEMA-free line only", notes: "Reacted to standard gel base in March. HEMA-free since, no issues." },
  { name: "Marcus Delaney", email: "m.delaney@protonmail.com", phone: "+44 7700 900663", tier: "GOLD" as const, totalVisits: 18, lifetimeValue: 1760, lastVisitAt: ago(8 * DAY), tags: ["manicure", "grooming"], notes: "Monthly classic manicure. Very punctual." },
  { name: "Yuki Tanaka", email: "yuki.tanaka@gmail.com", phone: "+44 7700 900771", tier: "GOLD" as const, totalVisits: 25, lifetimeValue: 2890, preferredTech: "Sofia Marchetti", lastVisitAt: ago(14 * DAY), tags: ["nail-art", "biab"] },
  { name: "Freya Lindqvist", email: "freya.l@fastmail.com", phone: "+44 7700 900209", tier: "SILVER" as const, totalVisits: 9, lifetimeValue: 620, lastVisitAt: ago(27 * DAY), tags: ["pedicure"] },
  { name: "Rosa Jiménez", email: "rosa.jimenez@gmail.com", phone: "+44 7700 900884", tier: "SILVER" as const, totalVisits: 7, lifetimeValue: 480, lastVisitAt: ago(35 * DAY), tags: ["gel"] },
  { name: "Deborah Whitfield", email: "d.whitfield@btinternet.com", phone: "+44 7700 900530", tier: "SILVER" as const, totalVisits: 11, lifetimeValue: 890, lastVisitAt: ago(21 * DAY), tags: ["classic"] },
  { name: "Nia Okafor", email: "nia.okafor@gmail.com", phone: "+44 7700 900617", tier: "NEW" as const, totalVisits: 1, lifetimeValue: 68, lastVisitAt: ago(4 * DAY), tags: ["first-visit", "biab"] },
  { name: "Elena Petrova", email: "elena.petrova@yahoo.com", phone: "+44 7700 900740", tier: "NEW" as const, totalVisits: 0, lifetimeValue: 0, tags: ["enquiry"] },
  { name: "Grace Adeyemi", email: "grace.adeyemi@gmail.com", phone: "+44 7700 900295", tier: "DIAMOND" as const, totalVisits: 54, lifetimeValue: 7310, preferredTech: "Priya Raman", lastVisitAt: ago(2 * DAY), tags: ["vip", "bridal"], notes: "Wedding in six weeks. Trial booked." },
];

// ─────────────────────────── Tickets ───────────────────────────

type SeedTicket = {
  customer: string;
  subject: string;
  body: string;
  channel: "EMAIL" | "CHAT" | "INSTAGRAM" | "PHONE" | "WEB_FORM" | "SMS";
  createdAgo: number;
  /** How far through the workflow this ticket should be seeded. */
  stage: "new" | "triaged" | "drafted" | "replied" | "escalated" | "resolved";
  assignee?: string;
  csat?: number;
  agentReply?: string;
};

const TICKETS: SeedTicket[] = [
  {
    customer: "isabella.fontaine@gmail.com",
    subject: "Gel lifted on four nails after three days",
    body: "I had a gel manicure with you on Thursday and by Sunday morning four nails had lifted at the cuticle. I've been coming to LUXENAILS for over three years and this has never happened before. I have a work event on Wednesday evening and I genuinely don't know what to do — I can't turn up like this. Please can someone call me today.",
    channel: "EMAIL",
    createdAgo: 26 * HOUR,
    stage: "escalated",
    assignee: "sofia@luxenails.com",
  },
  {
    customer: "aisling.byrne@gmail.com",
    subject: "Redness and itching around cuticles since Saturday",
    body: "I think I've had a reaction again. Since my appointment on Saturday the skin around three of my nails has been red, swollen and itching badly. I specifically asked for the HEMA-free products when I booked. I'm quite worried and would like to know what was actually used on me.",
    channel: "EMAIL",
    createdAgo: 40 * MINUTE,
    stage: "triaged",
  },
  {
    customer: "charlotte.mbeki@icloud.com",
    subject: "Charged twice for Saturday's appointment",
    body: "Hi, I've just checked my bank statement and there are two charges of £75 from LUXENAILS both dated Saturday. I only had one appointment. Could you please refund the duplicate? Happy to send a screenshot if that helps.",
    channel: "EMAIL",
    createdAgo: 5 * HOUR,
    stage: "drafted",
    assignee: "leo@luxenails.com",
  },
  {
    customer: "grace.adeyemi@gmail.com",
    subject: "Need to move my bridal trial",
    body: "Hi lovely team! My bridal trial is booked for next Tuesday but the venue has moved our final walkthrough to the same afternoon. Is there any chance of moving the trial to the Thursday or Friday that week? I know it's short notice. Thank you so much!",
    channel: "INSTAGRAM",
    createdAgo: 2 * HOUR,
    stage: "drafted",
    assignee: "priya@luxenails.com",
  },
  {
    customer: "priyanka.placeholder",
    subject: "How long does BIAB actually last?",
    body: "I'm thinking of switching from acrylic to BIAB but I'm worried it won't hold up. How long does it usually last before it needs an infill, and is it strong enough if I'm typing all day? Also roughly what does it cost including infills?",
    channel: "CHAT",
    createdAgo: 3 * HOUR,
    stage: "triaged",
  },
  {
    customer: "yuki.tanaka@gmail.com",
    subject: "Cancellation fee charged — I cancelled in time",
    body: "I cancelled my Saturday appointment on Wednesday evening, which is more than 48 hours in advance, but I've been charged the £20 deposit as a late cancellation. Could you look into this? I have the confirmation email showing the time I cancelled.",
    channel: "EMAIL",
    createdAgo: 9 * HOUR,
    stage: "replied",
    assignee: "hannah@luxenails.com",
    agentReply:
      "Hi Yuki, thank you for flagging this and I'm sorry for the confusion.\n\nYou're quite right — a cancellation made more than 48 hours ahead carries no fee, and your confirmation timestamp puts you well inside that window. The charge was applied in error on our side.\n\nI've reversed the £20 deposit charge and it will be back with you within 3 to 5 working days. Your deposit remains on file for your next booking, so nothing is lost.\n\nWarmly,\nHannah Blake\nLUXENAILS Client Care",
  },
  {
    customer: "marcus.delaney.placeholder",
    subject: "Do you have Saturday morning availability this week?",
    body: "Morning — any chance of a classic manicure slot this Saturday before midday? Flexible on the technician. Thanks.",
    channel: "SMS",
    createdAgo: 55 * MINUTE,
    stage: "new",
  },
  {
    customer: "nia.okafor@gmail.com",
    subject: "First BIAB set — how do I look after it?",
    body: "Hi! I had my first BIAB set on Friday and I love it. What should I be doing to keep it looking good, and when do I need to come back? Also is it okay to swim?",
    channel: "WEB_FORM",
    createdAgo: 4 * HOUR,
    stage: "new",
  },
  {
    customer: "elena.petrova@yahoo.com",
    subject: "Are your products vegan and cruelty free?",
    body: "Hello, before I book I'd like to check whether your polishes are vegan and whether any of your suppliers test on animals. I'd also like to know if you have a HEMA-free option as I've reacted to gel before.",
    channel: "WEB_FORM",
    createdAgo: 7 * HOUR,
    stage: "triaged",
  },
  {
    customer: "freya.l@fastmail.com",
    subject: "Gift card balance",
    body: "Hi, I was given a LUXENAILS gift card for my birthday and used part of it in March. Could you tell me what's left on it? The card number ends 4471.",
    channel: "EMAIL",
    createdAgo: 30 * HOUR,
    stage: "new",
  },
  {
    customer: "rosa.jimenez@gmail.com",
    subject: "Downgrading my membership",
    body: "Hi, I'd like to move from Gold down to Silver membership from next month if that's possible. Money is a bit tight at the moment but I don't want to stop coming altogether. What do I need to do?",
    channel: "EMAIL",
    createdAgo: 2 * DAY,
    stage: "resolved",
    assignee: "leo@luxenails.com",
    csat: 5,
    agentReply:
      "Hi Rosa, thank you for getting in touch, and there's absolutely no need to stop coming.\n\nA downgrade from Gold to Silver takes effect from your next billing date, so you'll keep your Gold benefits for the remainder of this cycle and then move to Silver at £45 a month. There's nothing to pay to make the change and nothing you need to do at your end — I've queued it up on your account.\n\nYour Silver membership still includes a classic manicure each month and 10% off anything else, so you'll keep your regular slot.\n\nWarmly,\nLeo Nakamura\nLUXENAILS Client Care",
  },
  {
    customer: "d.whitfield@btinternet.com",
    subject: "Thank you to Sofia",
    body: "I just wanted to say how lovely Sofia was at my appointment yesterday. I came in quite anxious about my nails after a bad experience elsewhere and she was so reassuring and patient. They look wonderful. Please pass this on to her.",
    channel: "EMAIL",
    createdAgo: 3 * DAY,
    stage: "resolved",
    assignee: "hannah@luxenails.com",
    csat: 5,
    agentReply:
      "Hi Deborah, what a joy to read this — thank you for taking the time to write.\n\nI've passed your message straight to Sofia and to our salon director. Reassuring someone who has had a difficult experience elsewhere is the part of the job she cares most about, so this will mean a great deal to her.\n\nWe'll see you at your next visit.\n\nWarmly,\nHannah Blake\nLUXENAILS Client Care",
  },
  {
    customer: "charlotte.placeholder2",
    subject: "Still no reply about my broken nail",
    body: "This is the second time I'm writing. A nail broke two days after my last set and I asked about a repair on Friday and heard nothing back. I don't think that's good enough given what I spend here.",
    channel: "EMAIL",
    createdAgo: 3 * DAY,
    stage: "escalated",
    assignee: "sofia@luxenails.com",
  },
  {
    customer: "isabella.placeholder2",
    subject: "Ingredient list for the topcoat you used",
    body: "Could you send me the full ingredient list for the glossy topcoat used on my last visit? My dermatologist has asked for it. No rush.",
    channel: "EMAIL",
    createdAgo: 20 * HOUR,
    stage: "triaged",
    assignee: "leo@luxenails.com",
  },
];

// Some tickets belong to a customer already used above; map the placeholders.
const PLACEHOLDER_MAP: Record<string, string> = {
  "priyanka.placeholder": "p.shah@outlook.com",
  "marcus.delaney.placeholder": "m.delaney@protonmail.com",
  "charlotte.placeholder2": "charlotte.mbeki@icloud.com",
  "isabella.placeholder2": "isabella.fontaine@gmail.com",
};

// ─────────────────────────── Seed ───────────────────────────

async function main() {
  console.log("\n💅  Seeding LUXENAILS demo data…\n");

  // Order matters — children before parents.
  await prisma.notification.deleteMany();
  await prisma.ticketEvent.deleteMany();
  await prisma.replyDraft.deleteMany();
  await prisma.message.deleteMany();
  await prisma.escalation.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.knowledgeChunk.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.slackAlert.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.slaPolicy.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  console.log("   cleared existing demo rows");

  // ── Team ──
  const passwordHash = await bcrypt.hash("luxe1234", env.bcryptRounds);
  const users = await Promise.all(
    USERS.map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  );
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  console.log(`   ${users.length} team members (password: luxe1234)`);

  // ── SLA policies ──
  await prisma.slaPolicy.createMany({
    data: [
      { name: "Urgent — safety, legal, same-day failure", priority: "URGENT", firstResponseMins: 15, resolutionMins: 120, escalateAfterMins: 15 },
      { name: "High — money, imminent bookings, VIP", priority: "HIGH", firstResponseMins: 60, resolutionMins: 480, escalateAfterMins: 60 },
      { name: "Medium — standard requests", priority: "MEDIUM", firstResponseMins: 240, resolutionMins: 1440, escalateAfterMins: 240 },
      { name: "Low — general enquiries and praise", priority: "LOW", firstResponseMins: 720, resolutionMins: 4320, escalateAfterMins: 720 },
    ],
  });
  const policies = await prisma.slaPolicy.findMany();
  const policyByPriority = new Map(policies.map((p) => [p.priority, p]));
  console.log(`   ${policies.length} SLA policies`);

  // ── Knowledge base + vector index ──
  let chunkCount = 0;
  for (const article of ARTICLES) {
    const created = await prisma.knowledgeArticle.create({
      data: {
        title: article.title,
        slug: article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        category: article.category,
        content: article.content,
        summary: article.summary,
        tags: article.tags,
        published: true,
        views: Math.floor(Math.random() * 120) + 10,
      },
    });

    // Body only — the title still feeds the embedding below, but citations
    // should quote policy text rather than repeat the heading.
    const passages = chunkText(created.content, env.ragChunkSize, env.ragChunkOverlap);

    await prisma.knowledgeChunk.createMany({
      data: passages.map((content, ordinal) => {
        const vector = embed(`${created.title} ${created.tags.join(" ")} ${content}`);
        return { articleId: created.id, ordinal, content, embedding: vector, dims: vector.length };
      }),
    });
    chunkCount += passages.length;
  }
  console.log(`   ${ARTICLES.length} knowledge articles → ${chunkCount} embedded chunks (512-dim)`);

  // ── Customers ──
  const customers = await Promise.all(
    CUSTOMERS.map((c) =>
      prisma.customer.create({
        data: { ...c, joinedAt: ago((c.totalVisits + 2) * 21 * DAY) },
      }),
    ),
  );
  const customerByEmail = new Map(customers.map((c) => [c.email, c]));
  console.log(`   ${customers.length} customers`);

  // ── Tickets, messages, drafts, escalations, events ──
  let ticketCount = 0;
  let draftCount = 0;
  let escalationCount = 0;

  for (const seed of TICKETS) {
    const email = PLACEHOLDER_MAP[seed.customer] ?? seed.customer;
    const customer = customerByEmail.get(email);
    if (!customer) continue;

    const createdAt = ago(seed.createdAgo);
    const assignee = seed.assignee ? userByEmail.get(seed.assignee) : undefined;

    // Run the real classifier so seeded data matches what the product produces.
    const triage = demoTriage({
      subject: seed.subject,
      body: seed.body,
      channel: seed.channel,
      customer: {
        name: customer.name,
        tier: customer.tier,
        totalVisits: customer.totalVisits,
        lifetimeValue: customer.lifetimeValue,
        lastVisitAt: customer.lastVisitAt,
      },
    });

    const isTriaged = seed.stage !== "new";
    const policy = policyByPriority.get(triage.priority);
    const frMins = policy?.firstResponseMins ?? 240;
    const resMins = policy?.resolutionMins ?? 1440;

    const hasReplied = seed.stage === "replied" || seed.stage === "resolved";
    const firstResponseAt = hasReplied ? new Date(createdAt.getTime() + Math.round(frMins * 0.6) * MINUTE) : null;
    const resolvedAt = seed.stage === "resolved" ? new Date(createdAt.getTime() + Math.round(resMins * 0.5) * MINUTE) : null;

    const ticket = await prisma.ticket.create({
      data: {
        subject: seed.subject,
        channel: seed.channel,
        customerId: customer.id,
        assigneeId: assignee?.id ?? null,
        createdAt,
        updatedAt: createdAt,
        status:
          seed.stage === "new"
            ? "NEW"
            : seed.stage === "triaged"
              ? "TRIAGED"
              : seed.stage === "drafted"
                ? "TRIAGED"
                : seed.stage === "replied"
                  ? "IN_PROGRESS"
                  : seed.stage === "escalated"
                    ? "ESCALATED"
                    : "RESOLVED",
        ...(isTriaged
          ? {
              category: triage.category,
              priority: triage.priority,
              sentiment: triage.sentiment,
              sentimentScore: triage.sentimentScore,
              aiSummary: triage.summary,
              aiIntent: triage.intent,
              aiConfidence: triage.confidence,
              aiReasoning: triage.reasoning,
              aiSuggestedTags: triage.tags,
              tags: triage.tags,
              triagedByAi: true,
              triagedAt: new Date(createdAt.getTime() + 8000),
              slaPolicyId: policy?.id ?? null,
              firstResponseDueAt: new Date(createdAt.getTime() + frMins * MINUTE),
              resolutionDueAt: new Date(createdAt.getTime() + resMins * MINUTE),
            }
          : {}),
        firstResponseAt,
        firstResponseMet: firstResponseAt ? true : null,
        resolvedAt,
        resolutionMet: resolvedAt ? true : null,
        slaState: resolvedAt ? "MET" : "ON_TRACK",
        isEscalated: seed.stage === "escalated",
        csatScore: seed.csat ?? null,
      },
    });
    ticketCount++;

    await prisma.message.create({
      data: {
        ticketId: ticket.id,
        authorType: "CUSTOMER",
        authorName: customer.name,
        body: seed.body,
        createdAt,
      },
    });

    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        type: "CREATED",
        message: `Ticket opened via ${seed.channel.replace("_", " ").toLowerCase()}`,
        actorName: customer.name,
        createdAt,
      },
    });

    if (isTriaged) {
      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "TRIAGED",
          message: `Classified as ${triage.category.replace(/_/g, " ").toLowerCase()} · ${triage.priority.toLowerCase()} priority · ${triage.sentiment.toLowerCase()} (${Math.round(triage.confidence * 100)}% confidence)`,
          actorName: "AI Triage (demo)",
          createdAt: new Date(createdAt.getTime() + 8000),
        },
      });
    }

    // Pending AI draft awaiting approval.
    if (seed.stage === "drafted") {
      const citations = await searchKnowledge(`${seed.subject}. ${seed.body}`);
      const draft = demoDraftReply({
        ticket: {
          number: ticket.number,
          subject: ticket.subject,
          category: triage.category,
          priority: triage.priority,
          sentiment: triage.sentiment,
          channel: seed.channel,
        },
        customer: {
          name: customer.name,
          tier: customer.tier,
          totalVisits: customer.totalVisits,
          preferredTech: customer.preferredTech,
        },
        conversation: [{ authorType: "CUSTOMER", authorName: customer.name, body: seed.body }],
        citations,
        agentName: assignee?.name ?? "Priya Raman",
      });

      await prisma.replyDraft.create({
        data: {
          ticketId: ticket.id,
          body: draft.body,
          confidence: draft.confidence,
          tone: draft.tone,
          model: draft.model,
          generatedBy: "Demo Engine",
          citations: citations as unknown as Prisma.InputJsonValue,
          status: "PENDING",
          createdAt: new Date(createdAt.getTime() + 45000),
        },
      });
      draftCount++;

      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "DRAFT_GENERATED",
          message: `AI drafted a reply from ${citations.length} knowledge base ${citations.length === 1 ? "passage" : "passages"} (${Math.round(draft.confidence * 100)}% confidence)`,
          actorName: "AI Reply Engine",
          createdAt: new Date(createdAt.getTime() + 45000),
        },
      });
    }

    // Approved draft that was actually sent.
    if (seed.agentReply && firstResponseAt && assignee) {
      const citations = await searchKnowledge(`${seed.subject}. ${seed.body}`);
      await prisma.replyDraft.create({
        data: {
          ticketId: ticket.id,
          body: seed.agentReply,
          finalBody: seed.agentReply,
          confidence: 0.82,
          model: "luxenails-demo-v1",
          generatedBy: "Demo Engine",
          citations: citations as unknown as Prisma.InputJsonValue,
          status: "APPROVED",
          approvedById: assignee.id,
          reviewedAt: firstResponseAt,
          createdAt: new Date(firstResponseAt.getTime() - 4 * MINUTE),
        },
      });
      draftCount++;

      await prisma.message.create({
        data: {
          ticketId: ticket.id,
          authorType: "AGENT",
          authorId: assignee.id,
          authorName: assignee.name,
          body: seed.agentReply,
          createdAt: firstResponseAt,
        },
      });

      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "DRAFT_APPROVED",
          message: `${assignee.name} approved and sent the AI draft as written`,
          actorName: assignee.name,
          actorId: assignee.id,
          createdAt: firstResponseAt,
        },
      });
    }

    if (resolvedAt && assignee) {
      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "RESOLVED",
          message: `${assignee.name} marked the ticket resolved`,
          actorName: assignee.name,
          actorId: assignee.id,
          createdAt: resolvedAt,
        },
      });
    }

    // Escalations, with the Slack alert they would have fired.
    if (seed.stage === "escalated") {
      const level = triage.priority === "URGENT" ? "L3_SALON_DIRECTOR" : "L2_SHIFT_MANAGER";
      const reason =
        seed.subject.includes("Still no reply")
          ? "Second contact about an unresolved issue from a Platinum member with no agent response."
          : "AI triage flagged this for manager attention: high-value client, service failure with a deadline.";

      await prisma.escalation.create({
        data: {
          ticketId: ticket.id,
          level,
          status: "OPEN",
          reason,
          trigger: seed.subject.includes("Still no reply") ? "SLA_BREACH" : "AI_RECOMMENDED",
          slackSent: true,
          triggeredAt: new Date(createdAt.getTime() + 20 * MINUTE),
        },
      });
      escalationCount++;

      await prisma.slackAlert.create({
        data: {
          channel: env.slackChannel,
          title: `Escalation — Ticket #${ticket.number}`,
          text: `*${ticket.subject}*\n${reason}`,
          status: "SIMULATED",
          ticketNumber: ticket.number,
          payload: {
            channel: env.slackChannel,
            blocks: [
              { type: "header", text: { type: "plain_text", text: `🚨 Escalation — Ticket #${ticket.number}` } },
              { type: "section", text: { type: "mrkdwn", text: `*${ticket.subject}*\n${reason}` } },
            ],
          },
          createdAt: new Date(createdAt.getTime() + 20 * MINUTE),
        },
      });

      await prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "ESCALATED",
          message: `Escalated to ${level.replace(/_/g, " ")} — ${reason}`,
          actorName: "SLA Monitor",
          createdAt: new Date(createdAt.getTime() + 20 * MINUTE),
        },
      });
    }
  }

  console.log(`   ${ticketCount} tickets · ${draftCount} AI drafts · ${escalationCount} escalations`);

  // ── Notifications for the whole team ──
  const openEscalations = await prisma.escalation.findMany({
    where: { status: "OPEN" },
    include: { ticket: true },
  });
  const pendingDrafts = await prisma.replyDraft.findMany({
    where: { status: "PENDING" },
    include: { ticket: true },
  });

  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const user of users) {
    for (const esc of openEscalations) {
      notifications.push({
        userId: user.id,
        ticketId: esc.ticketId,
        type: "ESCALATION",
        title: `Ticket #${esc.ticket.number} escalated`,
        body: `${esc.reason.slice(0, 120)} · ${esc.level.replace(/_/g, " ")}`,
        read: false,
        createdAt: esc.triggeredAt,
      });
    }
    for (const draft of pendingDrafts.slice(0, 2)) {
      notifications.push({
        userId: user.id,
        ticketId: draft.ticketId,
        type: "DRAFT_READY",
        title: `Draft ready for #${draft.ticket.number}`,
        body: `A reply is waiting for your approval on "${draft.ticket.subject}".`,
        read: false,
        createdAt: draft.createdAt,
      });
    }
  }
  await prisma.notification.createMany({ data: notifications });
  console.log(`   ${notifications.length} notifications`);

  // ── Default preferences ──
  await prisma.setting.createMany({
    data: [
      { key: "autoTriageOnIntake", value: true },
      { key: "autoDraftOnTriage", value: false },
      { key: "requireApprovalBeforeSend", value: true },
      { key: "slackAlertsEnabled", value: true },
      { key: "escalateOnAngrySentiment", value: true },
      { key: "salonName", value: "LUXENAILS" },
      { key: "salonTagline", value: "Mayfair · London" },
      { key: "replyTone", value: "warm-professional" },
    ],
  });

  console.log("\n✅  Seed complete.\n");
  console.log("   Sign in at http://localhost:5173");
  console.log("   amara@luxenails.com  ·  luxe1234   (Salon Director / Admin)");
  console.log("   priya@luxenails.com  ·  luxe1234   (Client Care Manager)");
  console.log("   sofia@luxenails.com  ·  luxe1234   (Senior Client Care)\n");
}

main()
  .catch((error) => {
    console.error("\n❌  Seed failed:\n", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
