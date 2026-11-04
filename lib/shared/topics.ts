// Topics, KPI committees and quick tips. Safe to import from browser code.

/** The portal's standing KPI committees (portal src/types.ts STANDING_COMMITTEES). */
export const COMMITTEES: { slug: string; name: string }[] = [
  { slug: "annual_event", name: "Annual Event Committee" },
  { slug: "digital_technology", name: "Digital & Technology Committee" },
  { slug: "judicial_ethics", name: "Judicial and Ethics Committee" },
  { slug: "membership_intake", name: "Membership Intake Committee" },
  { slug: "scholarship", name: "Scholarship Committee" },
  { slug: "transfer_member", name: "Transfer Member Committee" },
];

/** Route code for the Treasurer's queue: visible to people whose portal roles include "Treasurer". */
export const TREASURER_ROUTE = "treasurer";
export const DEFAULT_ROUTE = "digital_technology";
/** A topic whose route is this sends the request to the KPI committee the member picks, else D&T. */
export const MEMBER_CHOICE_ROUTE = "member_choice";

export const ROUTES: { code: string; name: string }[] = [
  ...COMMITTEES.map((committee) => ({ code: committee.slug, name: committee.name })),
  { code: TREASURER_ROUTE, name: "Treasurer" },
];

export function isRouteCode(value: unknown): value is string {
  return typeof value === "string" && ROUTES.some((route) => route.code === value);
}

export function isCommitteeSlug(value: unknown): value is string {
  return typeof value === "string" && COMMITTEES.some((committee) => committee.slug === value);
}

export function routeName(code: string | null | undefined) {
  if (!code) return "Not routed";
  return ROUTES.find((route) => route.code === code)?.name ?? code;
}

export type Topic = {
  code: string;
  label: string;
  description: string;
  defaultRoute: string;
  enabled: boolean;
  sort: number;
};

/** BR-10: the four launch topics, worded as in the proof of concept. Routing per Q3. */
export const DEFAULT_TOPICS: Topic[] = [
  {
    code: "COM",
    label: "Committee Roster & Workspace Help",
    description: "Get roster assignments, committee roles, or shared-file access corrected.",
    defaultRoute: MEMBER_CHOICE_ROUTE,
    enabled: true,
    sort: 1,
  },
  {
    code: "ACC",
    label: "Account, Dues & Profile Assistance",
    description: "Restore access or update your profile and dues information.",
    defaultRoute: TREASURER_ROUTE,
    enabled: true,
    sort: 2,
  },
  {
    code: "BUG",
    label: "Website & Display Troubleshooting",
    description: "Report what is not working so you can get back to using the portal.",
    defaultRoute: DEFAULT_ROUTE,
    enabled: true,
    sort: 3,
  },
  {
    code: "ENH",
    label: "Portal Idea & Feature Suggestion",
    description: "Suggest a practical change that would improve your member experience.",
    defaultRoute: DEFAULT_ROUTE,
    enabled: true,
    sort: 4,
  },
];

/** Where a new request goes (Q3). */
export function routeForTopic(topic: Pick<Topic, "defaultRoute">, chosenCommittee?: string | null) {
  if (topic.defaultRoute === MEMBER_CHOICE_ROUTE) {
    return chosenCommittee && isCommitteeSlug(chosenCommittee) ? chosenCommittee : DEFAULT_ROUTE;
  }
  return isRouteCode(topic.defaultRoute) ? topic.defaultRoute : DEFAULT_ROUTE;
}

export type Tip = { id: string; words: string[]; topic: string; answer: string };

/** BR-14: the proof of concept's quick tips. */
export const TIPS: Tip[] = [
  {
    id: "profile",
    words: ["executive title", "profile", "details"],
    topic: "ACC",
    answer: "Go to Member Portal, open Member Account Management, then choose Edit Profile.",
  },
  {
    id: "roster",
    words: ["roster", "assign member", "addition", "save"],
    topic: "COM",
    answer: "Choose Assign member and wait for the green confirmation message before leaving the page.",
  },
  {
    id: "dues",
    words: ["dues", "standing", "payment"],
    topic: "ACC",
    answer: "Open Dues Standing from the main Member Portal home screen.",
  },
  {
    id: "mobile",
    words: ["phone", "mobile", "opening", "display", "loading"],
    topic: "BUG",
    answer: "Refresh your mobile browser. If the page still does not open, clear your temporary browser history and try again.",
  },
];

export function matchTip(topic: string, subject: string, description: string): Tip | null {
  const text = `${subject} ${description}`.toLowerCase();
  return (
    TIPS.find((tip) => tip.words.some((word) => text.includes(word)) || (topic === tip.topic && description.length > 12)) ?? null
  );
}
