"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
import { newClientToken, postForm, postJson } from "@/app/components/client-api";
import TopicIcon from "@/app/components/topic-icon";
import { DESCRIPTION_MAX, FILE_ACCEPT, FILE_HELP, FILE_MAX_BYTES, FILES_PER_SUBMISSION, SUBJECT_MAX, formatBytes } from "@/lib/shared/limits";
import { URGENCIES } from "@/lib/shared/statuses";
import { matchTip, MEMBER_CHOICE_ROUTE } from "@/lib/shared/topics";

type TopicOption = { code: string; label: string; description: string; defaultRoute: string };

export default function NewRequestForm({
  topics,
  committees,
  csrf,
  name,
  email,
  enabled,
  normalDays,
  urgentDays,
}: {
  topics: TopicOption[];
  committees: { slug: string; name: string }[];
  csrf: string;
  name: string;
  email: string;
  enabled: boolean;
  normalDays: number;
  urgentDays: number;
}) {
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState("Normal");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [chosenFiles, setChosenFiles] = useState<File[]>([]);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ number: string; days: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const clientToken = useRef(newClientToken());
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const selected = topics.find((item) => item.code === topic) ?? null;
  const tip = useMemo(() => (tipDismissed || solved || !topic ? null : matchTip(topic, subject, description)), [description, solved, subject, tipDismissed, topic]);
  const days = urgency === "Urgent" ? urgentDays : normalDays;
  const dueText = days === 1 ? "within 1 business day" : `within ${days} business days`;

  function chooseTopic(code: string) {
    setTopic(code);
    setTipDismissed(false);
    window.setTimeout(() => document.getElementById("request-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setError("");
    if (picked.length > FILES_PER_SUBMISSION) {
      setError(`You can attach up to ${FILES_PER_SUBMISSION} files.`);
      event.target.value = "";
      setChosenFiles([]);
      return;
    }
    const tooBig = picked.find((file) => file.size > FILE_MAX_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is ${formatBytes(tooBig.size)}. Each file can be up to 10 MB.`);
      event.target.value = "";
      setChosenFiles([]);
      return;
    }
    setChosenFiles(picked);
  }

  async function markSolved() {
    if (tip) void postJson("/api/deflections", { topic, tipId: tip.id }, csrf);
    setSolved(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // BR-16: a second tap while the first is on its way does nothing.
    if (inFlight.current) return;
    setError("");
    if (!enabled) {
      setError("Request submission will open when the KP Support Center launches.");
      return;
    }
    if (!topic) {
      setError("Please choose what you need help with.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    form.set("topicCode", topic);
    form.set("clientToken", clientToken.current);
    form.delete("files");
    for (const file of chosenFiles) form.append("files", file);
    const result = await postForm<{ number: string }>("/api/requests", form, csrf);
    inFlight.current = false;
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Shown only once the server has saved the request (BR-15).
    setCreated({ number: result.data.number, days });
    clientToken.current = newClientToken();
    formRef.current?.reset();
    setTopic("");
    setSubject("");
    setDescription("");
    setChosenFiles([]);
    setUrgency("Normal");
  }

  async function copyNumber() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.number);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (solved) {
    return (
      <div className="support-panel">
        <div className="solved-card" role="status">
          <span className="success-icon" aria-hidden="true">✓</span>
          <p className="eyebrow">Question resolved</p>
          <h2>Glad the quick tip helped.</h2>
          <p>You can start a new request any time if you need more support.</p>
          <button type="button" className="button button-primary" onClick={() => { setSolved(false); setTipDismissed(false); }}>Start a request</button>
        </div>
      </div>
    );
  }

  return (
    <div className="support-panel">
      <form ref={formRef} className={`support-form ${topic ? "has-category" : ""}`} onSubmit={submit}>
        <ol className="request-stepper" aria-label="Request steps">
          <li className="complete"><span>1</span><strong>Choose a topic</strong></li>
          <li className={topic ? "active" : ""}><span>2</span><strong>Describe your request</strong></li>
          <li><span>3</span><strong>Confirmation</strong></li>
        </ol>
        <div className="section-heading">
          <span aria-hidden="true">01</span>
          <div><h2>What do you need help with?</h2><p>Select one option.</p></div>
        </div>
        <div className="category-grid" role="group" aria-label="Topics">
          {topics.map((item) => (
            <button type="button" key={item.code} className={`category-card ${topic === item.code ? "selected" : ""}`} aria-pressed={topic === item.code} onClick={() => chooseTopic(item.code)}>
              <span className="category-icon"><TopicIcon code={item.code} /></span>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <i aria-hidden="true">{topic === item.code ? "✓" : "→"}</i>
            </button>
          ))}
        </div>

        <div className="section-heading details-heading" id="request-details">
          <span aria-hidden="true">02</span>
          <div><h2>Tell us what you need</h2><p>Share the outcome you expected, what happened instead, and how it affects you.</p></div>
        </div>

        {selected && (
          <div className="selected-summary">
            <TopicIcon code={selected.code} />
            <span><small>Selected topic</small><strong>{selected.label}</strong></span>
            <button type="button" onClick={() => setTopic("")}>Change</button>
          </div>
        )}

        <div className="form-grid">
          <label>Your name<input value={name} readOnly aria-readonly="true" className="locked-input" /></label>
          <label>Your KPI email address<input value={email} readOnly aria-readonly="true" className="locked-input" /></label>
          <p className="locked-note full">These come from your sign-in, so we always know who to reply to.</p>
          {selected?.defaultRoute === MEMBER_CHOICE_ROUTE && (
            <label className="full">Which KPI committee is this about? (optional)
              <select name="chosenCommittee" defaultValue="">
                <option value="">I am not sure</option>
                {committees.map((committee) => <option key={committee.slug} value={committee.slug}>{committee.name}</option>)}
              </select>
            </label>
          )}
          <label className="full">When do you need this resolved?
            <select name="urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)} required>
              {URGENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="full">Give your request a short title
            <input name="subject" value={subject} onChange={(event) => { setSubject(event.target.value); setTipDismissed(false); }} required maxLength={SUBJECT_MAX} placeholder="Example: I cannot save a committee roster change" />
            <small className="field-count">{subject.length} of {SUBJECT_MAX}</small>
          </label>
          <label className="full">What do you need us to know?
            <textarea name="description" value={description} onChange={(event) => { setDescription(event.target.value); setTipDismissed(false); }} required maxLength={DESCRIPTION_MAX} rows={5} placeholder="What were you trying to do? What happened? What would a successful outcome look like?" />
            <small className="field-count">{description.length.toLocaleString("en-US")} of {DESCRIPTION_MAX.toLocaleString("en-US")}</small>
          </label>
        </div>

        {tip && (
          <aside className="tip-card" aria-live="polite">
            <span className="tip-bulb"><TopicIcon code="ENH" /></span>
            <div>
              <p className="eyebrow">Quick helpful tip</p>
              <h3>We found an answer that might help right now.</h3>
              <p>{tip.answer}</p>
              <div className="tip-actions">
                <button type="button" className="button button-primary" onClick={markSolved}>This solved my question</button>
                <button type="button" className="text-button" onClick={() => setTipDismissed(true)}>Continue submitting request</button>
              </div>
            </div>
          </aside>
        )}

        <label className="upload-box">
          <span aria-hidden="true">＋</span>
          <strong>Add screenshots or files</strong>
          <small>{FILE_HELP}</small>
          <input name="files" type="file" multiple accept={FILE_ACCEPT} onChange={chooseFiles} />
        </label>
        {chosenFiles.length > 0 && (
          <ul className="file-list chosen" aria-label="Files to send">
            {chosenFiles.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{formatBytes(file.size)}</small></li>)}
          </ul>
        )}

        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="submit-row">
          <p>{enabled ? `You will get a request number straight away. Expect a first response ${dueText}.` : "Request submission is turned off until the Support Center launches."}</p>
          <button className="button button-primary submit-button" disabled={submitting || !enabled}>
            {submitting ? "Sending your request..." : enabled ? "Submit and get my number" : "Submission opens at launch"}
            {enabled && !submitting && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </form>

      {created && (
        <div className="modal-backdrop" role="presentation">
          <section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <button type="button" className="modal-close" aria-label="Close confirmation" onClick={() => setCreated(null)}>×</button>
            <span className="success-icon" aria-hidden="true">✓</span>
            <p className="eyebrow">Request received</p>
            <h2 id="success-title">You are all set. Your request is saved.</h2>
            <p>Expect a first response {created.days === 1 ? "within 1 business day" : `within ${created.days} business days`}. A receipt will be emailed to {email}. Use your request number to check progress or add details without starting over.</p>
            <div className="request-number"><small>Your request number</small><strong data-testid="request-number">{created.number}</strong></div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={copyNumber}>{copied ? "Copied" : "Copy request number"}</button>
              <a className="button button-primary" href={`/requests/${encodeURIComponent(created.number)}`}>Open my request</a>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
