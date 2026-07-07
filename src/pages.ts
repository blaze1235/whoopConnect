const CONTACT_EMAIL = "a.sobirjonov09@gmail.com";

function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}
  h1{font-size:26px;margin-bottom:4px}
  h2{font-size:18px;margin-top:32px}
  .updated{color:#666;font-size:14px;margin-bottom:32px}
  ul{padding-left:20px}
  a{color:#0a66c2}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export const privacyPolicyHtml = page(
  "Privacy Policy — WHOOP Connect Bot",
  `
<h1>Privacy Policy</h1>
<p class="updated">Last updated: July 2026</p>

<p>WHOOP Connect Bot ("the Bot") is a Telegram bot that connects to your WHOOP
account and explains your wellness data in simple Russian or Uzbek. This
policy describes what data we collect, why, and how it is handled.</p>

<h2>Who we are</h2>
<p>This is an independently operated personal project, not affiliated with
or endorsed by WHOOP Inc. or Telegram. Contact: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>

<h2>What data we collect</h2>
<ul>
  <li>Your Telegram user ID and first name, and your chosen language (Russian or Uzbek).</li>
  <li>WHOOP OAuth access and refresh tokens, obtained only after you explicitly authorize
      the connection through WHOOP's own login page.</li>
  <li>WHOOP wellness data: recovery score, sleep performance and duration, strain,
      heart rate variability, resting heart rate, respiratory rate, blood oxygen (SpO2),
      and workout summaries.</li>
</ul>

<h2>How we use your data</h2>
<ul>
  <li>To fetch your latest WHOOP data and generate a simple, plain-language daily
      explanation, sent to you on Telegram.</li>
  <li>To send an automatic morning summary at a scheduled time each day.</li>
  <li>We do not use your data for advertising, profiling, or any purpose other than
      producing your requested explanations.</li>
</ul>

<h2>Sharing with third parties</h2>
<ul>
  <li>Telegram: used solely to deliver messages to you.</li>
  <li>An AI text-generation provider may receive your anonymized wellness numbers
      (no name, no account identifiers) to generate the explanation text. If no AI
      provider is configured, explanations are generated locally without sending any
      data externally.</li>
  <li>We do not sell, rent, or otherwise share your data with advertisers or data
      brokers.</li>
</ul>

<h2>Data storage and security</h2>
<p>Data is stored in a private PostgreSQL database. Access tokens are never
logged in full and are not exposed to other users. Only your own data is used
to generate your own explanations.</p>

<h2>Your controls</h2>
<ul>
  <li>You can disconnect WHOOP at any time by revoking the app's access from your
      WHOOP account settings.</li>
  <li>You can request full deletion of your stored data at any time by contacting
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>

<h2>No medical use</h2>
<p>The Bot explains wellness numbers in simple language only. It does not
diagnose, treat, or provide medical advice. If you feel unwell, consult a
qualified healthcare professional.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. Continued use of the Bot after
changes means you accept the updated policy.</p>
`
);

export const termsOfServiceHtml = page(
  "Terms of Service — WHOOP Connect Bot",
  `
<h1>Terms of Service</h1>
<p class="updated">Last updated: July 2026</p>

<p>By connecting your WHOOP account to WHOOP Connect Bot ("the Bot"), you agree
to the following terms.</p>

<h2>What the Bot does</h2>
<p>The Bot reads your WHOOP recovery, sleep, strain, and workout data (with
your explicit authorization via WHOOP's OAuth login) and sends you simple,
plain-language explanations by Telegram, in Russian or Uzbek.</p>

<h2>Not medical advice</h2>
<p>The Bot does not diagnose disease, does not claim medical certainty, and
does not replace professional medical care. All explanations are general
wellness information only. If you feel unwell, consult a doctor.</p>

<h2>No warranty</h2>
<p>The Bot is provided "as is," without warranty of any kind. WHOOP data may
occasionally be delayed, incomplete, or unavailable; the Bot will say so
rather than guess.</p>

<h2>Your responsibilities</h2>
<p>You are responsible for the WHOOP account you connect. You may disconnect
at any time by revoking access in your WHOOP account settings.</p>

<h2>Contact</h2>
<p><a href="mailto:a.sobirjonov09@gmail.com">a.sobirjonov09@gmail.com</a></p>
`
);
