// Email wording (BR-40 to BR-42). Branded HTML with a plain-text twin. Never attachments, never
// internal notes, never the text of a member's request: each message links back to the request,
// which needs sign-in.

import { supportUrl } from "./config";

export type EmailContent = { subject: string; html: string; text: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export function requestLink(number: string) {
  return `${supportUrl()}/requests/${encodeURIComponent(number)}`;
}

function render(subject: string, heading: string, paragraphs: string[], number: string | null, linkLabel: string, link: string): EmailContent {
  const htmlParagraphs = paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#17221a;font-size:15px;line-height:1.6">${escapeHtml(paragraph)}</p>`).join("");
  const numberBlock = number
    ? `<p style="margin:18px 0;padding:14px 16px;border:1px solid #dce4dc;border-radius:10px;background:#f8faf7;color:#174b2a;font-size:18px;font-weight:700">${escapeHtml(number)}</p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce4dc;border-radius:16px">
<tr><td style="padding:22px 26px;border-bottom:1px solid #dce4dc"><span style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:9px;background:#174b2a;color:#ffffff;font-weight:800;font-size:12px;text-align:center">KP</span>
<span style="margin-left:10px;color:#17221a;font-size:14px;font-weight:700">KP Support Center</span></td></tr>
<tr><td style="padding:26px">
<h1 style="margin:0 0 16px;color:#17221a;font-size:22px;line-height:1.25">${escapeHtml(heading)}</h1>
${htmlParagraphs}${numberBlock}
<p style="margin:22px 0 6px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#174b2a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">${escapeHtml(linkLabel)}</a></p>
<p style="margin:16px 0 0;color:#5f6b63;font-size:13px;line-height:1.6">You will be asked to sign in with your KPI email address before the request opens.</p>
</td></tr>
<tr><td style="padding:16px 26px;border-top:1px solid #dce4dc;color:#5f6b63;font-size:12px">© Order of KP, Inc.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [heading, "", ...paragraphs.flatMap((paragraph) => [paragraph, ""]), ...(number ? [`Request number: ${number}`, ""] : []), `${linkLabel}: ${link}`, "", "You will be asked to sign in with your KPI email address before the request opens.", "", "© Order of KP, Inc."].join("\n");
  return { subject, html, text };
}

export function receivedEmail(name: string, number: string, topicLabel: string, dueText: string): EmailContent {
  return render(
    `We received your request ${number}`,
    "Your request has been received",
    [`Hello ${name},`, `Thank you for contacting member support about ${topicLabel}.`, `Expect a first response ${dueText}. You can check progress or add details at any time.`],
    number,
    "Open your request",
    requestLink(number),
  );
}

export function staffReplyEmail(name: string, number: string): EmailContent {
  return render(
    `New reply on ${number}`,
    "There is a new reply on your request",
    [`Hello ${name},`, "Someone helping with your request has sent you a reply. Open the request to read it and answer if needed."],
    number,
    "Read the reply",
    requestLink(number),
  );
}

export function waitingEmail(name: string, number: string): EmailContent {
  return render(
    `We need something from you on ${number}`,
    "Your request is waiting on you",
    [`Hello ${name},`, "We need a little more information before we can continue. Open the request to see what is needed and reply there."],
    number,
    "Open your request",
    requestLink(number),
  );
}

export function completedEmail(name: string, number: string, reopenDays: number): EmailContent {
  return render(
    `Your request ${number} is completed`,
    "Your request is completed",
    [`Hello ${name},`, "Your request has been marked completed. Open it to read what was done.", `If the problem is not solved, reply on the request within ${reopenDays} days and it will reopen.`],
    number,
    "See what was done",
    requestLink(number),
  );
}

export function newRequestStaffEmail(number: string, topicLabel: string, urgency: string, committeeName: string): EmailContent {
  return render(
    `New ${urgency === "Normal" ? "" : `${urgency.toLowerCase()} `}request ${number}`,
    "A new request needs an owner",
    [`A new request about ${topicLabel} has been routed to the ${committeeName}.`, `Urgency: ${urgency}.`, "Open it to assign a person and reply to the member."],
    number,
    "Open the request",
    requestLink(number),
  );
}

export function assignedEmail(name: string, number: string): EmailContent {
  return render(
    `${number} is assigned to you`,
    "A request has been assigned to you",
    [`Hello ${name},`, "You are now the lead contact for this request. The member will see your name."],
    number,
    "Open the request",
    requestLink(number),
  );
}

export function alertEmail(summary: string, details: string[]): EmailContent {
  return render(`KP Support Center alert: ${summary}`, summary, details, null, "Open the Support Center health check", `${supportUrl()}/api/health`);
}
