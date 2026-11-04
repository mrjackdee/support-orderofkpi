import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dateLabel, dateTimeLabel } from "@/app/components/format";
import { SiteFooter, SiteHeader } from "@/app/components/site-chrome";
import { normalizeRequestNumber } from "@/lib/server/numbering";
import { requireSignedIn } from "@/lib/server/page-session";
import { ALL_ROUTES, getRequestView } from "@/lib/server/store";
import { filesLeft, formatBytes } from "@/lib/shared/limits";
import { PROGRESS_STAGES, progressIndex } from "@/lib/shared/statuses";
import type { FileView } from "@/lib/shared/views";
import MessageForm from "./message-form";
import { AssignControl, RerouteControl, StatusControl } from "./staff-panel";
import WithdrawButton from "./withdraw-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request details | KP Support Center", robots: { index: false } };

function FileLinks({ files }: { files: FileView[] }) {
  if (!files.length) return null;
  return (
    <ul className="file-list">
      {files.map((file) => (
        <li key={file.id}>
          <a href={`/api/files/${file.id}`} download>{file.name}</a>
          <small>{formatBytes(file.bytes)}</small>
        </li>
      ))}
    </ul>
  );
}

export default async function RequestPage({ params }: { params: Promise<{ number: string }> }) {
  const raw = decodeURIComponent((await params).number);
  const session = await requireSignedIn(`/requests/${encodeURIComponent(raw)}`);
  const number = normalizeRequestNumber(raw);
  // BR-21: someone else's request and a number that does not exist look the same.
  const view = number ? await getRequestView(number, session.actor) : null;
  if (!view) notFound();
  const { request, staff } = view;
  const stage = progressIndex(request.status);
  const closed = request.status === "COMPLETED" || request.status === "WITHDRAWN";
  // BR-13: 5 files per request in all. The server checks again when files are sent.
  const fileCount = request.files.length + request.conversation.reduce((sum, item) => sum + (item.kind === "message" ? item.files.length : 0), 0);
  const roomForFiles = filesLeft(fileCount);

  return (
    <main className="site-shell">
      <SiteHeader actor={session.actor} active={staff && !request.isOwner ? "staff" : "status"} />
      <section className="workspace status-workspace request-page" aria-labelledby="request-number-heading">
        <a className="back-to-list" href={staff && !request.isOwner ? "/staff" : "/requests"}>← {staff && !request.isOwner ? "Back to the staff queue" : "All my requests"}</a>
        <div className="status-header">
          <div><p className="eyebrow">Request number</p><h1 id="request-number-heading">{request.number}</h1></div>
          <span className={`status-pill ${request.status === "WAITING" ? "waiting" : ""}`} data-testid="status-pill">{request.statusLabel}</span>
        </div>

        {request.status === "WITHDRAWN" ? (
          <p className="withdrawn-note">This request was withdrawn. If you still need help, start a new request.</p>
        ) : (
          <ol className="progress-trail" aria-label="Request progress">
            {PROGRESS_STAGES.map((item, index) => (
              <li key={item.key} className={index <= stage ? "complete" : ""} aria-current={index === stage ? "step" : undefined}>
                <span aria-hidden="true">{index < stage ? "✓" : item.icon}</span>
                <strong>{index === 2 && request.status === "WAITING" ? "Waiting on You" : item.title}</strong>
              </li>
            ))}
          </ol>
        )}

        <div className="detail-grid">
          <div className="detail-main">
            <article className="request-details" aria-label="Request details">
              <div><span>Topic</span><strong>{request.topicLabel}</strong></div>
              <div><span>Sent</span><strong>{dateLabel(request.createdAt)}</strong></div>
              <div><span>Urgency</span><strong>{request.urgency}</strong></div>
              <div><span>KPI committee</span><strong>{request.committeeName}</strong></div>
              <div className="full"><span>Assigned to</span><strong>{request.leadContact}</strong></div>
              <div className="full"><span>Request details</span><strong>{request.subject}</strong><p className="pre-line">{request.description}</p><FileLinks files={request.files} /></div>
            </article>

            <section className="conversation" aria-labelledby="conversation-heading">
              <h2 id="conversation-heading">Conversation</h2>
              {request.conversation.length === 0 && <p className="panel-copy">No replies yet. You will be emailed when someone replies.</p>}
              <ol>
                {request.conversation.map((item) =>
                  item.kind === "event" ? (
                    <li key={`e${item.id}`} className="conversation-event"><span>{item.text}</span><time>{dateTimeLabel(item.createdAt)}</time></li>
                  ) : (
                    <li key={`m${item.id}`} className={`message ${item.authorRole}`}>
                      <div className="message-meta"><strong>{item.authorName}</strong><span>{item.authorRole === "staff" ? "Support team" : item.authorRole === "member" ? "Member" : "Update"}</span><time>{dateTimeLabel(item.createdAt)}</time></div>
                      <p className="pre-line">{item.body}</p>
                      <FileLinks files={item.files} />
                    </li>
                  ),
                )}
              </ol>
            </section>
          </div>

          <aside className="detail-side">
            {request.isOwner && (
              <div className="follow-up-card">
                {request.canReply ? (
                  <>
                    <p className="eyebrow">{request.canReopen ? "Not solved?" : "Add details"}</p>
                    <h2>{request.canReopen ? "Reply to reopen this request" : "Anything else we should know?"}</h2>
                    {request.canReopen && request.reopenUntil && <p className="panel-copy">You can reopen it until {dateLabel(request.reopenUntil)}.</p>}
                    <MessageForm number={request.number} csrf={session.csrf} kind="member" id="member-reply" label="Your message" placeholder="Add a detail, answer a question, or attach a screenshot." buttonLabel={request.canReopen ? "Reply and reopen" : "Send"} allowFiles filesLeft={roomForFiles} done="Thank you. Your message is on the request." />
                  </>
                ) : (
                  <>
                    <p className="eyebrow">Closed</p>
                    <h2>{request.status === "WITHDRAWN" ? "You withdrew this request" : "This request is closed"}</h2>
                    <p className="panel-copy">{request.status === "COMPLETED" ? "The 14-day reopen window has passed. If you still need help, start a new request." : "Start a new request if you still need help."}</p>
                    <a className="button button-primary" href="/requests/new">Start a new request</a>
                  </>
                )}
                {request.canWithdraw && <WithdrawButton number={request.number} csrf={session.csrf} />}
              </div>
            )}

            {staff && (
              <div className="request-editor staff-panel" aria-label="Staff tools">
                <p className="eyebrow">Staff only</p>
                <h2>Work this request</h2>
                <div className="member-line">
                  <strong>{staff.requesterName}</strong>
                  <span>{staff.requesterEmail}</span>
                  <span>{staff.firstResponseAt ? `First response ${dateTimeLabel(staff.firstResponseAt)}` : `First response due ${dateTimeLabel(staff.responseDueAt)}`}</span>
                  {staff.pastTarget && <span className="past-target">Past the response target</span>}
                  {staff.chosenCommittee && <span>Member chose: {ALL_ROUTES.find((route) => route.code === staff.chosenCommittee)?.name}</span>}
                </div>
                {staff.canSetStatus && <StatusControl key={request.status} number={request.number} csrf={session.csrf} status={request.status} />}
                <AssignControl key={`a-${staff.assigneeEmail ?? ""}`} number={request.number} csrf={session.csrf} staff={staff} />
                {staff.canReroute && <RerouteControl key={`r-${staff.routedCommittee}`} number={request.number} csrf={session.csrf} current={staff.routedCommittee} routes={ALL_ROUTES} />}
                {staff.canStaffReply && !closed && (
                  <MessageForm number={request.number} csrf={session.csrf} kind="staff" id="staff-reply" label="Reply to the member" placeholder="The member sees this and is emailed." buttonLabel="Send reply to member" allowFiles filesLeft={roomForFiles} done="Reply sent. The member has been emailed." />
                )}
                {staff.canNote && (
                  <MessageForm number={request.number} csrf={session.csrf} kind="note" id="internal-note" label="Internal note (staff only)" placeholder="Never shown to the member." buttonLabel="Save internal note" allowFiles={false} done="Note saved." />
                )}
                <section className="staff-notes" aria-labelledby="notes-heading">
                  <h3 id="notes-heading">Internal notes</h3>
                  {staff.notes.length ? (
                    <ol>{staff.notes.map((note) => <li key={note.id}><p className="pre-line">{note.body}</p><small>{note.authorName}, {dateTimeLabel(note.createdAt)}</small></li>)}</ol>
                  ) : <p className="panel-copy">No internal notes.</p>}
                </section>
                <section className="staff-history" aria-labelledby="history-heading">
                  <h3 id="history-heading">History</h3>
                  <ol>{staff.history.map((event) => <li key={event.id}><span>{event.text}</span><small>{event.actorName}, {dateTimeLabel(event.createdAt)}</small></li>)}</ol>
                </section>
              </div>
            )}
          </aside>
        </div>
      </section>
      <SiteFooter csrf={session.csrf} actor={session.actor} />
    </main>
  );
}
