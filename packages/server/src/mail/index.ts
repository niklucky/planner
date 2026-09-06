export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Development fallback: prints emails to stdout. */
export function createConsoleMailer(): Mailer {
  return {
    async send(mail) {
      console.log(`[mail] to: ${mail.to}\n[mail] subject: ${mail.subject}\n${mail.text}\n`)
    },
  }
}

export function createResendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(mail) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      })
      if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`)
    },
  }
}
