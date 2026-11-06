# KP Support Center: Acceptance test plan (D&T team)

| | |
| --- | --- |
| Test window | 11/25/2026 to 12/02/2026 (moved one week by Jack on 11/06/2026) |
| Where | https://test-support.orderofkpi.com, signed in through https://test.orderofkpi.com |
| Go or no-go | 12/02/2026, with Jack |
| Requirements | [BRD](BRD.md), BR-n numbers below |

## How to use this plan

- Work through each test in order and mark it **Pass** or **Fail**.
- For a Fail, write what you did, what you expected and what happened, and add a screenshot.
- Use the test site only. It is a rehearsal copy: nothing you do there reaches members or the live site.
- Do every test once on a computer and once on a phone.

## Testers and accounts

Each tester signs in with their own `@orderofkpi.org` account on the test portal. Testing needs at
least one person in each of these roles. **[To be named by Jack]**

| Role | Tester |
| --- | --- |
| Member (no committee) | |
| D&T Committee member | |
| D&T Committee chair (support lead) | |
| Treasurer | |
| Administrator | |
| Member whose dues are not paid (should be refused) | |

## Tests

### A. Signing in (BR-1 to BR-7)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| A1 | Sign in on test.orderofkpi.com, then choose **Open Support Center** on the Member Portal card | The support site opens already signed in, with no second password prompt | |
| A2 | Repeat A1 with the **Member Support Center** quick link | Same as A1 | |
| A3 | Go straight to test-support.orderofkpi.com and sign in with your portal address and password | Signed in | |
| A4 | Sign in on the support site with a wrong password | The portal's own "invalid email or password" message; not signed in | |
| A5 | Sign in with your personal email address instead of your KPI address | Told to use your @orderofkpi.org address | |
| A6 | Sign in as the member whose dues are not paid | Refused; told to use Forgot password or email admin@orderofkpi.org | |
| A7 | Choose **Forgot password?** on the support sign-in page | Opens the portal's password reset page | |
| A8 | Choose **Sign out**, then press the browser's Back button | Still signed out; the sign-in page shows | |

### B. Sending in a request (BR-10 to BR-17)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| B1 | Open **New Request** | Your name and KPI address are filled in and cannot be changed | |
| B2 | Choose each of the four topics in turn | Each topic opens the form | |
| B3 | Type a title over 140 characters, or a description over 2,500 | It stops you at the limit | |
| B4 | Type a description that matches a quick tip (for example, "forgot my password") | A quick-help tip appears; **This solved my question** ends without creating a request | |
| B5 | Send a request with a PDF and a Word file attached | Confirmation shows a number such as KP-BUG-2026-0001, with the response time | |
| B6 | Try to attach a file renamed to `.pdf` that is really something else, or a file over 10 MB | Refused with a plain message | |
| B7 | Press **Send** twice quickly | Only one request is created | |
| B8 | Check your email | A receipt with the request number arrives from info@kpi2012.org | |

### C. Following a request (BR-20 to BR-25)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| C1 | Open **Check Status** | Only your own requests are listed, newest first | |
| C2 | Type another tester's request number into the address bar | "Not found" | |
| C3 | Add a note and a screenshot to an open request | Both appear in the conversation | |
| C4 | Withdraw a request | Status shows Withdrawn | |
| C5 | After staff mark a request Completed (E5), reply to it | The request reopens | |

### D. Staff queue (BR-30 to BR-37), as D&T member, D&T chair, Treasurer

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| D1 | Open the staff queue as a D&T member | Website and Portal Idea requests show; dues requests do not | |
| D2 | Open it as the Treasurer | Account, Dues & Profile requests show | |
| D3 | Open it as the D&T chair or an administrator | Every request shows | |
| D4 | Search and filter by status, topic, urgency and age | The list narrows correctly | |
| D5 | Assign a request to a person | The member sees that person as the lead contact | |
| D6 | Reroute a request to another committee | It leaves your queue; the member sees the new committee | |
| D7 | Open an attachment on a request you can see | It downloads | |

### E. Replies, notes and status (BR-33 to BR-36, BR-40 to BR-43)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| E1 | Send a reply to the member | The member sees it and gets an email | |
| E2 | Write an internal note | The member never sees it, on screen or by email | |
| E3 | Set status to **Waiting on You** | The member is emailed | |
| E4 | Try to set **Completed** without a resolution note | Not allowed | |
| E5 | Set **Completed** with a note | The member is emailed the note | |
| E6 | Open the request's history | Every change shows who made it and when | |

### F. Reports and settings (BR-50, BR-51)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| F1 | Open reports as the D&T chair | Totals by topic, committee and status, the weekly trend and the response times show | |
| F2 | Export CSV as an administrator | A file downloads; it contains no internal notes | |
| F3 | Try to export CSV as a D&T member | Not offered | |

### G. Look, wording and phone (BR-55 to BR-58)

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- |
| G1 | Compare the pages with the proof-of-concept screenshots | Same green and gold look | |
| G2 | Read every page | Plain wording, "KPI committees", "Order of KP, Inc.", no headings or labels in capitals | |
| G3 | Use every page on a phone | Nothing scrolls sideways; buttons are easy to tap | |
| G4 | Move through a form with the Tab key only | Every field and button can be reached | |
| G5 | Look at the lower right corner of any page | A release stamp such as 2026-11-18 v.01 | |

## Sign-off

| Name | Role | Date | Go / No-go | Notes |
| --- | --- | --- | --- | --- |
| | | | | |
