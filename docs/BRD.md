# KP Support Center: Business Requirements Document

| | |
| --- | --- |
| Status | Decisions recorded 11/04/2026 |
| Version | 0.1, 11/04/2026 |
| Requested by | Jack Dee |
| Prepared by | Cheryl, CTO [Claude] |
| Companion document | [Tech spec](TECH_SPEC.md) |
| Systems | support.orderofkpi.com (this repository), orderofkpi.com (mrjackdee/OrderofKPI.com) |

Requirement numbers (BR-n) are cited by the tech spec and will be cited by every build hand-over.
Items marked **[Decision needed]** are open questions for Jack, collected in section 10.

---

## Decisions (Jack, 11/04/2026)

| # | Decision |
| --- | --- |
| Q1 | Financial members only at launch. A member who cannot sign in uses the orderofkpi.com password reset, or emails admin@orderofkpi.org |
| Q2 | Sign-in form on support.orderofkpi.com, checked against the portal behind the scenes |
| Q3 | Routing as proposed, each topic falling back to the support lead |
| Q4 | Support lead: D&T Committee chair plus administrators |
| Q5 | Add "Waiting on You" and "Withdrawn" |
| Q6 | 14-day reopen window |
| Q7 | Add Word and Excel; screen recordings by shared-drive link |
| Q8 | Retire the Google Sheet; the dashboard and CSV export replace it |
| Q9 | Follow the own-case rule for headings, small labels and buttons |
| Q10 | Business hours; Urgent within 1 business day |
| Q11 | Card stays at the bottom, open by default, plus a Quick Link |
| Q12 | Test copy at test-support.orderofkpi.com |
| Q13 | Live for members 12/01/2026, after formal UAT by the D&T team on test-support |
| Digest | The 8:00 AM daily summary goes to cto@orderofkpi.org only, not to committee chairs (Jack, 11/06/2026) |

The readable copy of this document, including Jack's answers, is the Claude Docs version:
https://claude.ai/artifact/41xap5QdUjvWu5EHt6Jryu

---

## 1. Purpose

Order of KP, Inc. members currently have no single place to ask for help. Requests arrive by email,
text and word of mouth, nobody can see who owns them, and members chase for updates.

The KP Support Center gives every signed-in member one place to:

- send in a request once, in plain language, to the right people;
- get a request number straight away;
- see its status, who is helping, and every update, without having to ask;
- add details later without starting a new request.

It gives the people who answer requests (the D&T Committee, other KPI committees, officers and
administrators) one queue with clear ownership, history and reporting.

## 2. Background: what exists today

**Support proof of concept (this repository).** A Next.js prelaunch site on Hostinger:

- a public coming-soon page at `/`;
- a working request form, status tracker and D&T dashboard, reachable only through a single
  shared administrator password;
- request submission switched off (`SUPPORT_REQUESTS_ENABLED=false`).

The proof of concept sets the look and feel and the member flow that this project keeps. It is not
production-ready:

- its storage (Cloudflare D1 and R2) does not exist on Hostinger;
- members have no identity, so anyone with a request number or an email address can read a request;
- there is no assignment, routing, internal notes or status emails.

**Member portal (orderofkpi.com).** Members sign in with their `@orderofkpi.org` address and their
own password. Signing in is limited to financial members (current-year dues paid), plus officers,
chairs and administrators. The portal already carries a collapsed "Member Support Center: coming
soon" card that links to support.orderofkpi.com. It also already runs a similar request process for
the Marketing Team (`MKT-` numbers), whose proven rules this project reuses rather than reinventing.

## 3. Goals and measures of success

| # | Goal | Measure |
| --- | --- | --- |
| G1 | Members get help without chasing | 90% of requests get a first response within 2 business days (the published "24 to 48 hours") |
| G2 | Every request has an owner | 100% of open requests have an assigned committee; 95% have a named person within 1 business day |
| G3 | One sign-in | Members use their existing orderofkpi.com credentials; no new accounts or passwords |
| G4 | Member data stays private | Zero cases of a member seeing another member's request or internal notes |
| G5 | Failures are visible | Every failed email, sync or sign-in outage reaches a named person the same day |

## 4. Scope

**In scope**

- The member request flow: choose a topic, describe the request, confirmation, status, updates.
- Sign-in to support.orderofkpi.com with orderofkpi.com credentials, both by link from the portal
  and directly on support.orderofkpi.com.
- A Support Center link inside the portal for signed-in members.
- A staff workspace (queue, assignment, status, member-facing replies, internal notes, reporting).
- Email notifications to members and staff.
- Production storage, file attachments, audit history, monitoring and alerting.
- A test copy and a live copy, following the portal's test-then-promote model.

**Out of scope (this release)**

- Live chat, phone support and SMS.
- Requests from people who are not members (the public and candidates). See BR-4.
- Changing how the portal itself signs people in, resets passwords or decides who may sign in.
- Moving the existing Marketing Requests process into the Support Center.

## 5. Users and roles

| Role | Who | What they can do |
| --- | --- | --- |
| Member | Anyone the portal lets sign in | Send in requests; see and update only their own |
| Support staff | Members of the KPI committee a request is routed to (the D&T Committee by default) | Work requests routed to their committee |
| Committee chair | The chair of that KPI committee | Same as support staff, plus assign and reassign within the committee |
| Support lead | D&T Committee chair, and anyone Jack names **(Q4: D&T Committee chair plus administrators)** | See and route every request; change settings |
| Administrator | Portal administrators | Everything, including reports and the audit history |

Who holds each role comes **from the portal**: its committee rosters and its role table. The Support
Center keeps no second list of people, because two lists drift apart.

## 6. Business requirements

### 6.1 Access and sign-in

- **BR-1** A member signed in on orderofkpi.com sees a "Member Support Center" link. Following it
  opens support.orderofkpi.com already signed in, with no second password prompt.
- **BR-2** A member can sign in directly at support.orderofkpi.com with the same `@orderofkpi.org`
  address and password they use on orderofkpi.com. No new account and no new password.
- **BR-3** The Support Center follows the portal's sign-in rules exactly:
  - Whoever the portal would refuse is refused here, with the same plain message.
  - If someone loses portal access (dues lapse, account closed, password changed), they lose
    Support Center access within 15 minutes.
- **BR-4** At launch the Support Center is for financial members only. A member who cannot sign in
  uses the orderofkpi.com password reset, or emails admin@orderofkpi.org. The sign-in page says so. (Q1)
- **BR-5** "Forgot password?" on the Support Center sign-in page uses the portal's existing
  password reset. The Support Center never stores, sees in logs, or resets passwords.
- **BR-6** Signing out of the Support Center ends the Support Center session on the server.
- **BR-7** The coming-soon page stays public until launch. After launch, `/` shows the sign-in page
  to visitors who are not signed in and the request form to members who are.

### 6.2 Sending in a request

- **BR-10** The member chooses one of four topics, worded as in the proof of concept:
  - Committee Roster & Workspace Help
  - Account, Dues & Profile Assistance
  - Website & Display Troubleshooting
  - Portal Idea & Feature Suggestion

  Administrators can add or switch off topics later. A topic already used by a request is never
  removed.
- **BR-11** The member's name and `@orderofkpi.org` address are filled in from their sign-in and
  cannot be changed on the form. The member is never asked who they are.
- **BR-12** Fields:
  - urgency: Normal, High or Urgent, with the proof-of-concept descriptions;
  - short title (up to 140 characters);
  - description (up to 2,500 characters);
  - optional attachments.

  The server enforces the same limits as the page.
- **BR-13** Attachments: JPG, PNG, WebP, PDF, Word or Excel, up to 10 MB each and 5 per request.
  Screen recordings come in as a shared-drive link. The file's contents are checked, not just its
  name. (Q7)
- **BR-14** Before submitting, the member sees any matching quick help (the proof of concept's
  tips, later the portal FAQ). Choosing "This solved my question" ends the flow without creating a
  request, and that choice is counted.
- **BR-15** On success the member sees a confirmation with the request number. It is shown only
  when the server has actually saved the request. The confirmation says when to expect a response.
- **BR-16** A double tap or page refresh never creates a second request.
- **BR-17** Request numbers read `KP-<TOPIC>-<YEAR>-<NNNN>`, for example `KP-COM-2026-0042`.
  Numbers are sequential, never reused, and appear on every screen and email.

### 6.3 Following a request

- **BR-20** "Check Status" lists all of the member's own requests, newest first, with status. The
  member can also open one by its number. Lookup by email address is removed.
- **BR-21** Opening a request the member does not own answers "not found", exactly as for a number
  that does not exist.
- **BR-22** The request page shows:
  - the four-stage progress trail;
  - topic, date sent and urgency;
  - the committee handling it and the lead contact's name;
  - the full conversation, in order;
  - attachments.
- **BR-23** The member can add details and files to an open request at any time. This is the "no
  separate follow-up messages needed" promise.
- **BR-24** The member can reopen a completed request within 14 days by replying to it.
  (Q6)
- **BR-25** The member can withdraw a request they no longer need.

### 6.4 Staff workspace

- **BR-30** Staff see a queue of requests routed to their committee. Support leads and
  administrators see every request. The queue can be searched and filtered by status, topic,
  urgency, committee, assignee and age.
- **BR-31** Each topic routes to a KPI committee by default. Staff can reroute a request, and the
  member is told which committee now has it. (Q3)
- **BR-32** A request can be assigned to a named person on the routed committee. That person's
  name is the "lead contact" the member sees.
- **BR-33** Statuses, as the member sees them:
  - Request Received
  - Under Review
  - Working On It
  - Waiting on You
  - Completed
  - Withdrawn

  "Waiting on You" is new and pauses the response clock. (Q5)
- **BR-34** Staff can send member-facing replies, which the member sees and is emailed about. They
  can also write internal notes, which never leave the server for a member.
- **BR-35** Closing a request as Completed requires a resolution note to the member. A request
  cannot be closed without telling the member what happened.
- **BR-36** Every change records who made it and when: status, assignment, routing, reply, note
  and file. Staff can read the history on the request.
- **BR-37** Attachments open only for the member who sent them and for staff who can see the
  request.

### 6.5 Notifications

- **BR-40** The member is emailed when:
  - the request is received (with its number);
  - staff reply;
  - the status changes to Waiting on You or Completed.
- **BR-41** The routed committee's chair, plus the support lead when the committee has no chair, is
  emailed about each new request. An assignee is emailed when a request is assigned to them.
- **BR-42** Emails follow the portal's established rules:
  - branded HTML with a plain-text version;
  - sent from info@kpi2012.org;
  - one message per person;
  - links back to the request, which require sign-in.

  The email never contains attachments or internal notes.
- **BR-43** A failed email never loses or blocks the request. It is retried, and if it still fails
  a person is alerted (BR-61).

### 6.6 Reporting

- **BR-50** Dashboard for support leads and administrators:
  - open backlog and urgent open requests;
  - requests past the response target;
  - average age;
  - volume by topic, committee and status;
  - a weekly trend;
  - first-response and resolution times;
  - count of "This solved my question" deflections.
- **BR-51** Export to CSV for administrators, with the same privacy rules as the screen.
- **BR-52** The Google Sheet "D&T Master Requests" is retired at launch. The dashboard and CSV
  export replace it, and the Apps Script link is switched off. (Q8)

### 6.7 Look, feel and wording

- **BR-55** support.orderofkpi.com keeps the proof of concept's look and feel:
  - deep green and gold palette;
  - green "What happens next" rail;
  - card-based topic grid;
  - stepper;
  - gold "24 to 48 hours" badge;
  - four-stage progress trail;
  - New Request and Check Status tabs.
- **BR-56** Wording follows the organization's rules:
  - everyday language;
  - "KPI committees";
  - "Order of KP, Inc." with no "The" (the proof-of-concept footer currently reads "THE ORDER OF
    KPI, INC." and must be corrected);
  - professional ticket terms ("Status", "Request Details", "Assigned to").
- **BR-57** Headings, the small gold labels and button text appear in their own case, not capitals
  ("Member support", "Check request status"). (Q9)
- **BR-58** Works at phone width (375 px) with no sideways scrolling, and meets WCAG 2.1 AA
  (contrast, keyboard use, screen-reader labels).

### 6.8 Reliability, privacy and operations

- **BR-60** Member data (names, addresses, request contents, attachments) is never committed to
  git and never stored in Firestore. The same rule applies on the portal.
- **BR-61** Every automated part has a failure signal that reaches a person:
  - the site going down;
  - email failing;
  - Sheet sync failing;
  - the portal sign-in link failing;
  - backups failing.

  Silent failure is a defect.
- **BR-62** Data is backed up daily, and a restore is tested before launch.
- **BR-63** There is a test copy (fed from `main`) and a live copy (fed from `live`), as on the
  portal. Promoting to live is Jack's decision.
- **BR-64** Pages show the release stamp in the portal's format (`YYYY-MM-DD v.NN`).
- **BR-65** Test and QA accounts cannot sign in to the live Support Center, matching the portal.

## 7. Member journey (target)

1. A member opens orderofkpi.com, signs in, and selects **Member Support Center**.
2. support.orderofkpi.com opens, already signed in, on **New Request**.
3. The member picks a topic, chooses urgency, and writes a title and description. Matching quick
   help appears; if it solves the question, they stop there.
4. They submit, see `KP-ACC-2026-0007`, and receive a receipt email.
5. The request is routed to the Treasurer's queue (per the routing table in Q3). The owner is
   emailed and assigns it to a person.
6. That person replies. The member is emailed, opens **Check Status**, reads the reply, and adds a
   screenshot.
7. Staff mark it **Completed** with a resolution note. The member is emailed. If the fix did not
   work, they reply within 14 days and the request reopens.

Members who go straight to support.orderofkpi.com sign in there with their portal address and
password, then continue from step 2.

## 8. Assumptions

- Hostinger remains the host for both sites.
- The portal stays the only authority on who may sign in and what roles they hold.
- Support volume at launch is modest: under 200 requests a month, under 50 staff users.
- The D&T Committee staffs the queue at launch.

## 9. Dependencies and risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Sign-in needs new, additive endpoints on the portal | The work touches orderofkpi.com, which members rely on | Additive endpoints only; full regression on the test site; Jack promotes |
| Lapsed members cannot sign in but have dues questions | The people who most need help are locked out | Q1 |
| Committee rosters start empty (blank-slate launch) | A topic routes to a committee with nobody on it | Fallback to the support lead; alert when a request has no owner after 1 business day |
| Email deliverability (`@orderofkpi.org` addresses are forwarding aliases) | Notifications look forged | Send from info@kpi2012.org, as the portal does |
| The proof of concept's Google Apps Script web app is unauthenticated | Anyone with its URL can write rows and send email as "Order of KP Member Support" | Replace it, or add a shared secret before launch (Q8) |

## 10. Questions for Jack

1. **Lapsed and locked-out members.** The portal refuses sign-in to members whose dues are not
   paid, yet "Account, Dues & Profile" is the topic they most need. Options:
   - a public "I can't sign in" form for account and dues problems only (rate-limited and checked
     against the roster);
   - point them to an email address;
   - exclude them.

   *Recommendation: the public form.*
2. **Direct sign-in style.** BR-2 can be met two ways:
   - a sign-in form on support.orderofkpi.com that checks the password with the portal behind the
     scenes;
   - redirecting to the orderofkpi.com sign-in page and back.

   *Recommendation: the form on support.orderofkpi.com, as you described.* The tech spec covers
   both.
3. **Routing table.** Proposed defaults, each with a fallback to the support lead:
   - Committee Roster & Workspace Help → the committee named in the request, else D&T;
   - Account, Dues & Profile → Treasurer;
   - Website & Display → D&T;
   - Portal Ideas → D&T.

   Is that right?
4. **Support lead.** Who oversees the whole queue at launch: the D&T Committee chair, specific
   officers, or administrators only?
5. **Statuses.** Add "Waiting on You" and "Withdrawn" to the proof of concept's four?
6. **Reopen window.** Is 14 days after completion right?
7. **Attachments.** Keep JPG, PNG, WebP and PDF only, or also allow Word, Excel and short screen
   recordings?
8. **Google Sheet.** Keep feeding "D&T Master Requests", or let the dashboard and CSV export
   replace it?
9. **Capitalized labels.** Keep the proof of concept's small capitalized gold labels for the look
   and feel, or follow the "own case" headings rule?
10. **Response promise.** Is "24 to 48 hours" business hours or calendar hours, and does it apply to
    Urgent requests?
11. **Portal card.** Turning the collapsed "coming soon" card into a live link changes a layout you
    set on 09/27/2026. May it stay at the bottom but open by default, plus a Quick Link?
12. **Test address.** Proposed test copy: `test-support.orderofkpi.com`. Is that acceptable, and who
    sets up DNS and the Hostinger site?
13. **Deadline.** What date do you need this live for members?
