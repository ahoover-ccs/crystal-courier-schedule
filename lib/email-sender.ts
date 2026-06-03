export type SendEmailResult = {
  ok: boolean;
  channel: "resend" | "log";
  error?: string;
};

export async function sendTransactionalEmail(params: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "Crystal Courier <onboarding@resend.dev>";
  const recipients = Array.isArray(params.to) ? params.to : [params.to];

  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    if (res.ok) {
      return { ok: true, channel: "resend" };
    }
    const errText = await res.text();
    console.error("[email] Resend error:", res.status, errText);
    return { ok: false, channel: "resend", error: `${res.status}: ${errText}` };
  }

  console.warn(
    "[email] (no RESEND_API_KEY — logged only)\nTo:",
    recipients.join(", "),
    "\n",
    params.subject,
    "\n",
    params.text
  );
  return { ok: true, channel: "log" };
}
