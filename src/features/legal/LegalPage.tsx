import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from '../../ui/icons'
import { Logo } from '../../ui/Logo'

/**
 * The Privacy Policy and Terms (public, no sign-in; the only pages search engines may list: public/robots.txt and
 * public/_headers). They describe what the app actually does: keep them in step with the consent notice
 * (src/features/auth/ConsentScreen.tsx), PRD D9 (retention) and docs/infrastructure/services.md.
 */
const UPDATED = '26 September 2026'
const SCHOOL = 'Jumpstart Preschool & Learning Center'
const ADDRESS = '11/7 Matoshri, Kishor B Tapadia Path, Karve Road, Erandwane, Pune 411004'
const EMAIL = 'ai@jumpstartpreschool.in'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h2 className="text-h3">{title}</h2>
      <div className="grid gap-2.5 text-body text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_b]:text-ink">{children}</div>
    </section>
  )
}

/** Title, description and canonical address for the page, so it's listed correctly and only once. */
function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const before = { title: document.title, description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '' }
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    const canonical = Object.assign(document.createElement('link'), { rel: 'canonical', href: location.origin + location.pathname })
    document.head.append(canonical)
    return () => {
      document.title = before.title
      document.querySelector('meta[name="description"]')?.setAttribute('content', before.description)
      canonical.remove()
    }
  }, [title, description])
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="gutter mx-auto w-full max-w-[calc(760px+2*var(--gutter))] pt-[max(24px,calc(env(safe-area-inset-top)+16px))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" aria-label="Jumpstart Go home"><Logo className="h-10" /></Link>
        <Link to="/" className="linkbtn inline-flex items-center gap-1.5 [&_svg]:size-4"><ArrowLeft aria-hidden />Back to Jumpstart Go</Link>
      </header>
      <article className="card mt-6 grid gap-8 rounded-2xl p-6 sm:p-9">
        <div>
          <h1 className="text-h1">{title}</h1>
          <p className="mt-2 text-small font-semibold text-ink-2">{SCHOOL}. Last updated {UPDATED}.</p>
        </div>
        {children}
      </article>
      <nav aria-label="Policies" className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-small font-bold">
        <Link to="/privacy" className="linkbtn">Privacy Policy</Link>
        <Link to="/terms" className="linkbtn">Terms of Use</Link>
      </nav>
    </main>
  )
}

export function PrivacyPage() {
  usePageMeta('Privacy Policy · Jumpstart Preschool', "How the Jumpstart app for Jumpstart Preschool, Karve Road, looks after families' and children's information.")
  return (
    <Frame title="Privacy Policy">
      <p className="text-lead text-ink-2">The Jumpstart Go app helps {SCHOOL}, Karve Road, run safe drop-offs and pickups. This page explains what it keeps, why, who sees it and for how long.</p>
      <Section title="Who is responsible">
        <p>{SCHOOL}, {ADDRESS}, is responsible for the information in the app. Contact us at <a className="linkbtn px-0" href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
      </Section>
      <Section title="What we keep">
        <ul>
          <li><b>Families:</b> names, email addresses and phone numbers of parents and family members the school registers, and how they are related to each child.</li>
          <li><b>Children:</b> name, date of birth, class, programme and regular drop-off and pickup times; attendance and absences.</li>
          <li><b>Staff:</b> names, contact details and roles.</li>
          <li><b>Trips:</b> who is dropping off or collecting, the expected time, and each step at the gate.</li>
          <li><b>Someone collecting on a family's behalf:</b> the name, mobile number and relation the parent enters, and their location on the way if they choose to share it.</li>
          <li><b>Messages</b> between families and the school, and calls the school logs.</li>
        </ul>
        <p>We never collect photos, and nothing is used for advertising.</p>
      </Section>
      <Section title="Where it comes from">
        <p>The school adds families and staff, one at a time or from a spreadsheet the office uploads. Parents add the people they send to collect. Someone already on the records is matched by email or mobile, so nobody is added twice.</p>
      </Section>
      <Section title="Location, only during a trip">
        <p>Parents, family members on a child's record and school staff never share or see location in the app. A child's location is never tracked.</p>
        <p>The only exception is someone a parent sends to collect a child with a one-time link, such as a driver or a friend. That person is asked whether to share where they are on the way; they can say no and still collect the child with the code at the gate. If they share, <b>only the parent who sent the link</b> sees it, never the school. Sharing stops when they tap Reached home, or an hour after the handover.</p>
      </Section>
      <Section title="Why we use it">
        <p>To hand every child only to someone the family has approved, to know who is arriving and when, to keep attendance, and to let families and the school message each other. Parents agree to this when they first sign in.</p>
      </Section>
      <Section title="Who can see it">
        <p>Parents and family see only their own children. School staff see what they need for their role: the gate team sees who is expected, and the office sees records and messages. Access is enforced by the database itself, not only by the app.</p>
      </Section>
      <Section title="Services we use">
        <p>The app runs on these providers, each only for its job:</p>
        <ul>
          <li><b>Supabase</b> (database, sign-in and storage), hosted in Singapore.</li>
          <li><b>Cloudflare</b> serves the app's pages.</li>
          <li><b>Brevo</b> sends sign-in codes and invitations by email.</li>
          <li>Invitations and pickup links sent by text message or WhatsApp go from the school's or the parent's own phone, through those services.</li>
          <li><b>OpenFreeMap</b> provides map images; <b>OpenRouteService</b> may be used for routes and arrival times.</li>
          <li>Apple, Google and Mozilla deliver notifications to devices that turn them on.</li>
          <li>Spoken announcements at the gate are made by an open-source voice (AI4Bharat's Indic Parler-TTS) running on the school's own computer, not by an outside service. It receives only the words of each announcement, which include the child's first and last name and the first name and relation of the person arriving, and keeps nothing. The recordings are kept in the school's Supabase storage so the same announcement is never made twice. If that computer can't be reached, the gate's own tablet speaks instead.</li>
        </ul>
      </Section>
      <Section title="How long we keep it">
        <ul>
          <li>Trip records, and a collector's location: 30 days.</li>
          <li>Attendance: this academic year and the one before.</li>
          <li>A log of sensitive actions (who changed what): one year.</li>
          <li>Everything else: while the family is at the school. When a child leaves, the school removes them from every list.</li>
        </ul>
      </Section>
      <Section title="Keeping it safe">
        <p>Only people the school adds can sign in, with a one-time code sent to their email; there are no passwords to steal. Information is encrypted in transit, and every sensitive change is recorded. A link for someone collecting works on one phone, needs the last four digits of their mobile, and stops after the trip.</p>
      </Section>
      <Section title="On your device">
        <p>The app keeps you signed in and remembers settings in your browser's storage, and on the gate's tablets keeps copies of announcement recordings so they play at once. It uses no advertising or analytics cookies and does not track you across other sites.</p>
      </Section>
      <Section title="Your choices">
        <p>You can ask the school at any time to see, correct or remove your family's information, or to turn off app access. Write to <a className="linkbtn px-0" href={`mailto:${EMAIL}`}>{EMAIL}</a> or speak to the office.</p>
      </Section>
      <Section title="Changes">
        <p>If this policy changes in a way that matters, the app asks parents to read and agree to it again.</p>
      </Section>
    </Frame>
  )
}

export function TermsPage() {
  usePageMeta('Terms of Use · Jumpstart Preschool', 'The terms for using the Jumpstart app for drop-offs and pickups at Jumpstart Preschool, Karve Road.')
  return (
    <Frame title="Terms of Use">
      <p className="text-lead text-ink-2">These terms cover the Jumpstart Go app, which {SCHOOL} provides to its families and staff.</p>
      <Section title="Who can use it">
        <p>Only people the school adds: parents and family of enrolled children, and school staff. Someone collecting a child can open the one-time link a parent sends them, on one phone, for that trip only.</p>
      </Section>
      <Section title="Signing in">
        <p>You sign in with your email and a 6-digit code we email you. A code works once, for 5 minutes. For your safety a new code can be sent once a minute, and a few times an hour; if you ask again sooner, use the code you already have.</p>
      </Section>
      <Section title="Keep access to yourself">
        <ul>
          <li>Don't share your sign-in code or let others use your account.</li>
          <li>Send pickup links and gate codes only to the person collecting, and only for that trip.</li>
          <li>Tell the school straight away if a phone with the app is lost, so it can turn off access.</li>
        </ul>
      </Section>
      <Section title="The gate still decides">
        <p>A child is handed over only to someone the school can check: a registered parent or family member, or the person with that trip's code. Staff may ask for identification and may refuse a handover they aren't sure about.</p>
      </Section>
      <Section title="Location">
        <p>The school doesn't track anyone's location. Someone you send to collect with a one-time link may choose to share where they are, and only you see it; please send links only to people who agree to this.</p>
      </Section>
      <Section title="Times and location are a guide">
        <p>Arrival times and positions come from phones and networks and can be late or wrong. The app is not an emergency service: in an emergency, call the school or the emergency services directly.</p>
      </Section>
      <Section title="When the app isn't available">
        <p>The school aims to keep the app running but can't promise it always will be. If it's down, the gate works as usual and you can call the office.</p>
      </Section>
      <Section title="Fair use">
        <p>Use the app only for your child's drop-offs, pickups and school messages. Don't try to reach information that isn't yours or disrupt the service; the school can turn off access if the app is misused.</p>
      </Section>
      <Section title="Your information">
        <p>How we handle it is set out in the <Link to="/privacy" className="linkbtn px-0">Privacy Policy</Link>.</p>
      </Section>
      <Section title="Questions">
        <p>Contact {SCHOOL} at <a className="linkbtn px-0" href={`mailto:${EMAIL}`}>{EMAIL}</a> or {ADDRESS}.</p>
      </Section>
    </Frame>
  )
}
