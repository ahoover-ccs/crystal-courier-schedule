type SendSmsResult = { ok: boolean; channel: "twilio" | "log" };

/**
 * Sends one SMS. Uses Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
 * TWILIO_FROM_NUMBER are set; otherwise logs to the console (same pattern as email).
 */
export async function sendTransactionalSms(params: {
  to: string;
  body: string;
}): Promise<SendSmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (sid && token && from) {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const form = new URLSearchParams();
    form.set("To", params.to);
    form.set("From", from);
    form.set("Body", params.body);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[sms] Twilio error:", res.status, errText);
    } else {
      return { ok: true, channel: "twilio" };
    }
  }

  console.warn(
    "[sms] (Twilio not configured — logged only)\nTo:",
    params.to,
    "\n",
    params.body
  );
  return { ok: true, channel: "log" };
}
