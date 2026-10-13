// Supabase Edge Function: send a receipt for an appointment request.
// Configure secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
// BREVO_SENDER_EMAIL (and optionally BREVO_SENDER_NAME). Never expose these in Vite.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!supabaseUrl || !serviceKey || !brevoKey || !senderEmail) return json({ error: "Email service is not configured." }, 503);
  let appointmentId = "";
  try { const body = await req.json(); appointmentId = String(body.appointment_id || ""); }
  catch { return json({ error: "Invalid JSON body." }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appointmentId)) return json({ error: "A valid appointment ID is required." }, 400);
  const api = supabaseUrl.replace(/\/$/, "") + "/rest/v1/appointments";
  const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" };
  const lookup = await fetch(api + "?id=eq." + appointmentId + "&select=id,customer_name,customer_email,service_name,price,starts_at,confirmation_email_sent_at,confirmation_email_claimed_at&limit=1", { headers });
  if (!lookup.ok) return json({ error: "Could not load appointment." }, 502);
  const rows = await lookup.json();
  const appointment = rows[0];
  if (!appointment) return json({ error: "Appointment not found." }, 404);
  if (appointment.confirmation_email_sent_at) return json({ sent: true, already_sent: true });
  const claimed = await fetch(api + "?id=eq." + appointmentId + "&confirmation_email_sent_at=is.null&confirmation_email_claimed_at=is.null", {
    method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({ confirmation_email_claimed_at: new Date().toISOString() }),
  });
  if (!claimed.ok) return json({ error: "Could not reserve email delivery." }, 502);
  const claimRows = await claimed.json();
  if (!claimRows.length) return json({ sent: false, message: "Email is already being processed." }, 202);
  const date = new Date(appointment.starts_at);
  const dateLabel = date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const safe = (s: string) => s.replace(/[&<>"']/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const firstName = safe(String(appointment.customer_name).split(" ")[0]);
  const service = safe(String(appointment.service_name));
  const htmlContent = "<div style=\"font-family:Arial,sans-serif;color:#4c333a;max-width:560px;margin:auto;padding:32px\"><p style=\"letter-spacing:3px;color:#ad737e;font-size:11px\">GLOSS &amp; GRACE · NAIL STUDIO</p><h1 style=\"font-family:Georgia,serif;font-weight:400\">A little note for you, " + firstName + " ♡</h1><p>We've received your appointment request. We're so glad you're planning a little time for yourself.</p><div style=\"background:#fbf3ef;padding:20px;margin:24px 0\"><p><b>Service</b><br>" + service + "</p><p><b>Requested date</b><br>" + safe(dateLabel) + "</p><p><b>Requested time</b><br>" + safe(timeLabel) + " (India time)</p><p><b>Estimated total</b><br>₹" + Number(appointment.price).toLocaleString("en-IN") + "</p></div><p>Your slot is not confirmed yet. Our team will get in touch to confirm availability.</p><p style=\"color:#8b777a;font-size:12px\">With a little extra love,<br>Gloss &amp; Grace</p></div>";
  const mail = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: Deno.env.get("BREVO_SENDER_NAME") || "Gloss & Grace", email: senderEmail },
      to: [{ email: appointment.customer_email, name: appointment.customer_name }],
      subject: "We've received your Gloss & Grace appointment request",
      htmlContent,
      textContent: "Hi " + appointment.customer_name + ", we received your request for " + appointment.service_name + " on " + dateLabel + " at " + timeLabel + " India time. This is not yet a confirmed appointment; our team will contact you shortly.",
    }),
  });
  if (!mail.ok) {
    await fetch(api + "?id=eq." + appointmentId, { method: "PATCH", headers, body: JSON.stringify({ confirmation_email_claimed_at: null }) });
    return json({ sent: false, error: "Email provider could not send the message." }, 502);
  }
  await fetch(api + "?id=eq." + appointmentId, { method: "PATCH", headers, body: JSON.stringify({ confirmation_email_sent_at: new Date().toISOString(), confirmation_email_claimed_at: null }) });
  return json({ sent: true });
});
