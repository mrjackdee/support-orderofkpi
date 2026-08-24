"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "request" | "status";

type SupportRequest = {
  requestNumber: string;
  categoryCode: string;
  categoryLabel: string;
  memberName: string;
  memberEmail: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  leadContact: string;
  committeeNotes: string;
  attachmentName?: string | null;
  sheetSyncStatus?: string;
  emailReceiptStatus?: string;
  createdAt: string;
  updatedAt: string;
};

type FollowUp = {
  id: number;
  message: string;
  createdAt: string;
};

const categories = [
  {
    code: "COM",
    title: "Committee Roster & Workspace Help",
    description: "Get roster assignments, committee roles, or shared-file access corrected.",
  },
  {
    code: "ACC",
    title: "Account, Dues & Profile Assistance",
    description: "Restore access or update your profile and dues information.",
  },
  {
    code: "BUG",
    title: "Website & Display Troubleshooting",
    description: "Report what is not working so you can get back to using the portal.",
  },
  {
    code: "ENH",
    title: "Portal Idea & Feature Suggestion",
    description: "Suggest a practical change that would improve your member experience.",
  },
];

const tips = [
  {
    words: ["executive title", "profile", "details"],
    category: "ACC",
    answer: "Go to Member Portal, open Member Account Management, then choose Edit Profile.",
  },
  {
    words: ["roster", "assign member", "addition", "save"],
    category: "COM",
    answer: "Choose ASSIGN MEMBER and wait for the green confirmation message before leaving the page.",
  },
  {
    words: ["dues", "standing", "payment"],
    category: "ACC",
    answer: "Open Dues Standing from the main Member Portal home screen.",
  },
  {
    words: ["phone", "mobile", "opening", "display", "loading"],
    category: "BUG",
    answer: "Refresh your mobile browser. If the page still does not open, clear your temporary browser history and try again.",
  },
];

const stages = [
  { key: "RECEIVED", title: "Request Received", icon: "✓" },
  { key: "REVIEW", title: "Under Review", icon: "◷" },
  { key: "WORKING", title: "Working On It", icon: "⚒" },
  { key: "COMPLETED", title: "Completed & Updated", icon: "◆" },
];

function CategoryIcon({ code }: { code: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (code === "COM") {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  }
  if (code === "ACC") {
    return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M7 15h3"/></svg>;
  }
  if (code === "BUG") {
    return <svg {...common}><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4M9 5h6"/></svg>;
  }
  return <svg {...common}><path d="M9 18h6M10 22h4M8.4 14.8A7 7 0 1 1 15.6 14.8C14.6 15.5 14 16.3 14 17h-4c0-.7-.6-1.5-1.6-2.2Z"/></svg>;
}

function dateLabel(value: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function statusIndex(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("COMPLETE") || normalized.includes("UPDATED")) return 3;
  if (normalized.includes("WORK")) return 2;
  if (normalized.includes("REVIEW")) return 1;
  return 0;
}

export default function SupportCenter({
  initialView = "request",
  initialName = "",
  initialEmail = "",
  initialIsCommittee = false,
  initialLookup = "",
  requestsEnabled = false,
}: {
  initialView?: View;
  initialName?: string;
  initialEmail?: string;
  initialIsCommittee?: boolean;
  initialLookup?: string;
  requestsEnabled?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tipDismissed, setTipDismissed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<SupportRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [lookup, setLookup] = useState(initialLookup);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [matches, setMatches] = useState<SupportRequest[]>([]);
  const [selected, setSelected] = useState<SupportRequest | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState("");

  const quickTip = useMemo(() => {
    if (tipDismissed || solved) return null;
    const text = `${subject} ${description}`.toLowerCase();
    return (
      tips.find(
        (tip) =>
          tip.words.some((word) => text.includes(word)) ||
          (category === tip.category && description.length > 12),
      ) ?? null
    );
  }, [category, description, solved, subject, tipDismissed]);

  useEffect(() => {
    if (initialLookup) void runLookup(undefined, initialLookup);
    // The initial status link should run only once when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCategory(code: string) {
    setCategory(code);
    setTipDismissed(false);
    window.setTimeout(() => {
      document.getElementById("request-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function chooseView(next: View) {
    setView(next);
    setLookupError("");
    window.history.replaceState(null, "", next === "status" ? "/status" : "/member-support");
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!requestsEnabled) {
      setFormError("Request submission will open when the KP Support Center launches.");
      return;
    }
    if (!category) {
      setFormError("Please choose what you need help with.");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData(event.currentTarget);
      form.set("categoryCode", category);
      const response = await fetch("/api/requests", { method: "POST", body: form });
      const data = (await response.json()) as { request?: SupportRequest; error?: string };
      if (!response.ok || !data.request) throw new Error(data.error || "Please try again.");
      setCreatedRequest(data.request);
      formRef.current?.reset();
      setCategory("");
      setSubject("");
      setDescription("");
      setTipDismissed(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runLookup(event?: FormEvent, override?: string) {
    event?.preventDefault();
    const term = (override ?? lookup).trim();
    if (!term) {
      setLookupError("Enter a request number or email address.");
      return;
    }

    setLookingUp(true);
    setLookupError("");
    setSelected(null);
    try {
      const key = term.includes("@") ? "email" : "id";
      const response = await fetch(`/api/requests?${key}=${encodeURIComponent(term)}`);
      const data = (await response.json()) as {
        requests?: SupportRequest[];
        selected?: SupportRequest;
        followUps?: FollowUp[];
        error?: string;
      };
      if (!response.ok || !data.selected) throw new Error(data.error || "No request found.");
      setMatches(data.requests ?? [data.selected]);
      setSelected(data.selected);
      setFollowUps(data.followUps ?? []);
    } catch (error) {
      setMatches([]);
      setLookupError(error instanceof Error ? error.message : "No request found.");
    } finally {
      setLookingUp(false);
    }
  }

  async function openRequest(requestNumber: string) {
    setLookup(requestNumber);
    setLookingUp(true);
    try {
      const response = await fetch(`/api/requests?id=${encodeURIComponent(requestNumber)}`);
      const data = (await response.json()) as {
        selected?: SupportRequest;
        followUps?: FollowUp[];
        error?: string;
      };
      if (!response.ok || !data.selected) throw new Error(data.error || "No request found.");
      setSelected(data.selected);
      setFollowUps(data.followUps ?? []);
      setLookupError("");
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "No request found.");
    } finally {
      setLookingUp(false);
    }
  }

  async function addFollowUp(event: FormEvent) {
    event.preventDefault();
    if (!selected || !followUp.trim()) return;
    setFollowUpMessage("");
    const response = await fetch("/api/requests/follow-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestNumber: selected.requestNumber, message: followUp }),
    });
    const data = (await response.json()) as { followUp?: FollowUp; error?: string };
    if (!response.ok || !data.followUp) {
      setFollowUpMessage(data.error || "We could not add your note.");
      return;
    }
    setFollowUps((current) => [data.followUp!, ...current]);
    setFollowUp("");
    setFollowUpMessage("Your note has been added for the committee.");
  }

  const selectedStage = selected ? statusIndex(selected.status) : 0;

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/member-support" aria-label="Order of KP support home">
          <span className="brand-mark" aria-hidden="true">KP</span>
          <span className="brand-copy"><strong>Member Support</strong><small>Order of KP</small></span>
        </a>
        <nav className="primary-nav" aria-label="Support navigation">
          <button className={view === "request" ? "active" : ""} onClick={() => chooseView("request")}>New Request</button>
          <button className={view === "status" ? "active" : ""} onClick={() => chooseView("status")}>Check Status</button>
        </nav>
        <div className="member-badge"><span aria-hidden="true" /> Member Access</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">MEMBER SUPPORT</p>
          <h1>{view === "request" ? "Get help without chasing an update." : "Know exactly where your request stands."}</h1>
          <p>
            {view === "request"
              ? "Tell us once, receive a request number, and follow your progress from receipt through resolution."
              : "See the latest status, committee update, and lead contact. Add new details without submitting another request."}
          </p>
        </div>
        <div className="response-badge"><strong>24 to 48 hours</strong><span>Typical response time</span></div>
      </section>

      <section className="benefit-strip" aria-label={view === "request" ? "Member support benefits" : "Request tracking benefits"}>
        {view === "request" ? (
          <>
            <article><span aria-hidden="true">01</span><div><strong>Get to the right person</strong><small>Your topic routes the request to the right support area.</small></div></article>
            <article><span aria-hidden="true">02</span><div><strong>Save time with instant help</strong><small>A helpful tip may answer your question before you submit.</small></div></article>
            <article><span aria-hidden="true">03</span><div><strong>Stay informed</strong><small>Your request number keeps every update in one place.</small></div></article>
          </>
        ) : (
          <>
            <article><span aria-hidden="true">01</span><div><strong>See current progress</strong><small>Know whether your request is received, under review, in progress, or complete.</small></div></article>
            <article><span aria-hidden="true">02</span><div><strong>Know who is helping</strong><small>View the assigned lead contact and the latest committee note.</small></div></article>
            <article><span aria-hidden="true">03</span><div><strong>Keep everything together</strong><small>Add follow-up information without opening another request.</small></div></article>
          </>
        )}
      </section>

      {view === "request" ? (
        <section className="workspace request-workspace" aria-label="Submit a support request">
          <aside className="support-rail">
            <p className="eyebrow">WHAT HAPPENS NEXT</p>
            <h2>One request. Clear ownership. Visible progress.</h2>
            <ol>
              <li><span>1</span><div><strong>Tell us once</strong><small>Share the issue, impact, and any helpful screenshot.</small></div></li>
              <li><span>2</span><div><strong>We assign ownership</strong><small>Your request reaches the person best suited to help.</small></div></li>
              <li><span>3</span><div><strong>You stay informed</strong><small>Check progress and committee updates at any time.</small></div></li>
            </ol>
            <div className="rail-note"><span aria-hidden="true">✓</span><p><strong>No separate follow-up messages needed</strong><small>Add notes and see updates from the same request record.</small></p></div>
          </aside>
          <div className="support-panel">
          {solved ? (
            <div className="solved-card" role="status">
              <span className="success-icon">✓</span>
              <p className="eyebrow">QUESTION RESOLVED</p>
              <h2>Glad the quick tip helped.</h2>
              <p>You can start a new request any time if you need more support.</p>
              <button className="button button-primary" onClick={() => { setSolved(false); setTipDismissed(false); }}>Start a request</button>
            </div>
          ) : (
            <form ref={formRef} className={`support-form ${category ? "has-category" : ""}`} onSubmit={submitRequest}>
              <ol className="request-stepper" aria-label="Request steps">
                <li className="complete"><span>1</span><strong>Choose a topic</strong></li>
                <li className={category ? "active" : ""}><span>2</span><strong>Describe your request</strong></li>
                <li><span>3</span><strong>Confirmation</strong></li>
              </ol>
              <div className="section-heading">
                <span>01</span>
                <div><h2>What do you need help with?</h2><p>Select one option.</p></div>
              </div>
              <div className="category-grid">
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item.code}
                    className={`category-card ${category === item.code ? "selected" : ""}`}
                    aria-pressed={category === item.code}
                    onClick={() => selectCategory(item.code)}
                  >
                    <span className="category-icon"><CategoryIcon code={item.code} /></span>
                    <span><strong>{item.title}</strong><small>{item.description}</small></span>
                    <i aria-hidden="true">{category === item.code ? "✓" : "→"}</i>
                  </button>
                ))}
              </div>

              <div className="section-heading details-heading" id="request-details">
                <span>02</span>
                <div><h2>Tell us what you need</h2><p>Share the outcome you expected, what happened instead, and how it affects you.</p></div>
              </div>

              {category && <div className="selected-summary"><CategoryIcon code={category} /><span><small>SELECTED TOPIC</small><strong>{categories.find((item) => item.code === category)?.title}</strong></span><button type="button" onClick={() => setCategory("")}>Change</button></div>}

              <div className="form-grid">
                <label>Your Name<input name="memberName" autoComplete="name" required defaultValue={initialName} placeholder="First and last name" /></label>
                <label>Your Email Address<input name="memberEmail" type="email" autoComplete="email" required defaultValue={initialEmail} placeholder="name@example.com" /></label>
                <label className="full">When Do You Need This Resolved?
                  <select name="priority" defaultValue="Normal" required>
                    <option value="Normal">Normal, no immediate deadline</option><option value="High">High, affecting current work</option><option value="Urgent">Urgent, blocking an immediate need</option>
                  </select>
                </label>
                <label className="full">Give Your Request a Short Title
                  <input name="subject" value={subject} onChange={(event) => { setSubject(event.target.value); setTipDismissed(false); }} required maxLength={140} placeholder="Example: I cannot save a committee roster change" />
                </label>
                <label className="full">What Do You Need Us to Know?
                  <textarea name="description" value={description} onChange={(event) => { setDescription(event.target.value); setTipDismissed(false); }} required maxLength={2500} rows={5} placeholder="What were you trying to do? What happened? What would a successful outcome look like?" />
                </label>
              </div>

              {quickTip && (
                <aside className="tip-card" aria-live="polite">
                  <span className="tip-bulb"><CategoryIcon code="ENH" /></span>
                  <div><p className="eyebrow">QUICK HELPFUL TIP</p><h3>We found an answer that might help right now.</h3><p>{quickTip.answer}</p>
                    <div className="tip-actions">
                      <button type="button" className="button button-primary" onClick={() => setSolved(true)}>This Solved My Question</button>
                      <button type="button" className="text-button" onClick={() => setTipDismissed(true)}>Continue Submitting Request</button>
                    </div>
                  </div>
                </aside>
              )}

              <label className="upload-box">
                <span aria-hidden="true">＋</span>
                <strong>Add a screenshot or file</strong>
                <small>Optional. JPG, PNG, WebP, or PDF up to 5 MB.</small>
                <input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
              </label>

              {formError && <p className="form-message error" role="alert">{formError}</p>}
              <div className="submit-row">
                <p>{requestsEnabled ? "You will receive a request number immediately so you can check progress or add information later." : "This administrator view is for prelaunch review. Request submission is currently turned off."}</p>
                <button className="button button-primary submit-button" disabled={submitting || !requestsEnabled}>{submitting ? "Submitting Request..." : requestsEnabled ? "Submit and Get My Number" : "Submission Opens at Launch"}{requestsEnabled && <span aria-hidden="true">→</span>}</button>
              </div>
            </form>
          )}
          </div>
        </section>
      ) : (
        <section className="workspace status-workspace" aria-label="Request status lookup">
          <form className="lookup-form" onSubmit={runLookup}>
            <label htmlFor="lookup">Request Number or Email Address</label>
            <div><input id="lookup" value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="KP-COM-2026-0042 or your email" /><button className="button button-primary" disabled={lookingUp}>{lookingUp ? "Checking..." : "Find My Request"}</button></div>
            {lookupError && <p className="form-message error" role="alert">{lookupError}</p>}
          </form>

          {matches.length > 1 && (
            <div className="request-list">
              <p className="eyebrow">YOUR RECENT REQUESTS</p>
              <div>{matches.map((item) => <button key={item.requestNumber} className={selected?.requestNumber === item.requestNumber ? "selected" : ""} onClick={() => openRequest(item.requestNumber)}><span><strong>{item.requestNumber}</strong><small>{item.subject}</small></span><em>{dateLabel(item.createdAt)}</em></button>)}</div>
            </div>
          )}

          {selected ? (
            <div className="status-results">
              <div className="status-header">
                <div><p className="eyebrow">REQUEST NUMBER</p><h2>{selected.requestNumber}</h2></div>
                <span className="status-pill">{stages[selectedStage].title}</span>
              </div>

              <ol className="progress-trail" aria-label="Request progress">
                {stages.map((stage, index) => (
                  <li key={stage.key} className={index <= selectedStage ? "complete" : ""}>
                    <span>{index < selectedStage ? "✓" : stage.icon}</span><strong>{stage.title}</strong>
                  </li>
                ))}
              </ol>

              <div className="detail-grid">
                <article className="request-details">
                  <div><span>Category</span><strong>{selected.categoryLabel}</strong></div>
                  <div><span>Submitted</span><strong>{dateLabel(selected.createdAt)}</strong></div>
                  <div><span>Priority</span><strong>{selected.priority}</strong></div>
                  <div><span>Lead Contact</span><strong>{selected.leadContact}</strong></div>
                  <div className="full"><span>Your Request</span><strong>{selected.subject}</strong><p>{selected.description}</p></div>
                  <div className="full committee-update"><span>Committee Update</span><p>{selected.committeeNotes}</p></div>
                </article>
                <aside className="follow-up-card">
                  <p className="eyebrow">ADD A NOTE</p><h3>Anything else we should know?</h3>
                  <form onSubmit={addFollowUp}><textarea value={followUp} onChange={(event) => setFollowUp(event.target.value)} maxLength={1500} rows={5} placeholder="Add a note or follow-up..." /><button className="button button-primary">Send Follow-Up</button></form>
                  {followUpMessage && <p className="form-message" role="status">{followUpMessage}</p>}
                  {followUps.length > 0 && <div className="follow-up-list"><h4>Your Follow-Ups</h4>{followUps.map((note) => <div key={note.id}><p>{note.message}</p><small>{dateLabel(note.createdAt)}</small></div>)}</div>}
                </aside>
              </div>
            </div>
          ) : !lookingUp && !lookupError ? (
            <div className="empty-state"><span aria-hidden="true">⌕</span><h2>Everything about your request, in one place.</h2><p>Enter your request number or email to see progress, ownership, committee notes, and your follow-ups.</p></div>
          ) : null}
        </section>
      )}

      <footer><span>© {new Date().getFullYear()} THE ORDER OF KPI, INC.</span>{initialIsCommittee && <a href="/committee">D&amp;T Administration</a>}<form action="/api/prelaunch-logout" method="post"><button type="submit">Sign Out</button></form><span>TRADITION &amp; EXCELLENCE</span></footer>

      {createdRequest && (
        <div className="modal-backdrop" role="presentation">
          <section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <button className="modal-close" aria-label="Close confirmation" onClick={() => setCreatedRequest(null)}>×</button>
            <span className="success-icon">✓</span>
            <p className="eyebrow">REQUEST RECEIVED</p>
            <h2 id="success-title">You are all set. Your request is now trackable.</h2>
            <p>Expect a response within 24 to 48 hours. Use your request number to check progress or add details without starting over.</p>
            {createdRequest.emailReceiptStatus === "SENT" && <p className="delivery-confirmation success">A confirmation email was sent to {createdRequest.memberEmail}.</p>}
            {createdRequest.emailReceiptStatus === "FAILED" && <p className="delivery-confirmation warning">Your request is saved. The email receipt could not be delivered, so keep the request number below.</p>}
            <div className="request-number"><small>YOUR REQUEST NUMBER</small><strong>{createdRequest.requestNumber}</strong></div>
            <div className="modal-actions">
              <button className="button button-secondary" onClick={() => navigator.clipboard.writeText(createdRequest.requestNumber)}>Copy Request Number</button>
              <button className="button button-primary" onClick={() => { const number = createdRequest.requestNumber; setLookup(number); setCreatedRequest(null); chooseView("status"); void runLookup(undefined, number); }}>Check Request Status</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
