// Every permission decision in the Support Center (TECH_SPEC 5.2). Pure: no database, no clock
// other than the `now` passed in.

import { REOPEN_DAYS } from "../shared/limits";
import { isOpenStatus } from "../shared/statuses";
import { DEFAULT_ROUTE, TREASURER_ROUTE } from "../shared/topics";

export type Actor = {
  personId: string | null;
  email: string;
  name: string;
  roles: string[];
  isAdmin: boolean;
  isStaff: boolean;
  committees: string[];
  committeeRoles: Record<string, "chair" | "member">;
};

export type RequestAccessFacts = {
  requesterPersonId: string | null;
  requesterEmail: string;
  status: string;
  routedCommittee: string;
  completedAt: number | null;
};

export type Action =
  | "view"
  | "view_internal"
  | "member_reply"
  | "withdraw"
  | "reopen"
  | "staff_reply"
  | "note"
  | "set_status"
  | "assign"
  | "reroute";

export type GlobalAction = "view_queue" | "view_all" | "reports" | "settings" | "export_csv";

const TREASURER_ROLE = "treasurer";

function hasRole(actor: Actor, role: string) {
  return actor.roles.some((item) => item.trim().toLowerCase() === role);
}

/** Q4: the D&T Committee chair plus administrators. */
export function isSupportLead(actor: Actor) {
  return actor.isAdmin || actor.committeeRoles[DEFAULT_ROUTE] === "chair";
}

/** Is this person on the route's KPI committee (or the Treasurer, for the Treasurer route)? */
export function isOnRoute(actor: Actor, route: string) {
  if (route === TREASURER_ROUTE) return hasRole(actor, TREASURER_ROLE);
  return actor.committees.includes(route) || Boolean(actor.committeeRoles[route]);
}

/** Is this person the route's chair? The Treasurer leads the Treasurer route. */
export function isRouteChair(actor: Actor, route: string) {
  if (route === TREASURER_ROUTE) return hasRole(actor, TREASURER_ROLE);
  return actor.committeeRoles[route] === "chair";
}

/** Routes whose queue this person works. */
export function staffRoutes(actor: Actor) {
  const routes = new Set<string>();
  for (const committee of actor.committees) routes.add(committee);
  for (const [slug] of Object.entries(actor.committeeRoles)) routes.add(slug);
  if (hasRole(actor, TREASURER_ROLE)) routes.add(TREASURER_ROUTE);
  return [...routes];
}

export function isOwner(actor: Actor, request: Pick<RequestAccessFacts, "requesterPersonId" | "requesterEmail">) {
  if (actor.personId && request.requesterPersonId && actor.personId === request.requesterPersonId) return true;
  return actor.email.toLowerCase() === request.requesterEmail.toLowerCase();
}

/** Staff on this request: support lead, or on the routed KPI committee. */
export function isStaffFor(actor: Actor, request: Pick<RequestAccessFacts, "routedCommittee">) {
  return isSupportLead(actor) || isOnRoute(actor, request.routedCommittee);
}

export function reopenDeadline(completedAt: number) {
  return completedAt + REOPEN_DAYS * 24 * 60 * 60 * 1000;
}

export function can(actor: Actor, action: Action, request: RequestAccessFacts, now = Date.now()): boolean {
  const owner = isOwner(actor, request);
  const staff = isStaffFor(actor, request);
  switch (action) {
    case "view":
      return owner || staff;
    case "view_internal":
    case "staff_reply":
    case "note":
    case "set_status":
      return staff;
    case "assign":
    case "reroute":
      return isSupportLead(actor) || isRouteChair(actor, request.routedCommittee);
    case "member_reply":
      if (!owner) return false;
      if (isOpenStatus(request.status)) return true;
      return can(actor, "reopen", request, now);
    case "withdraw":
      return owner && isOpenStatus(request.status);
    case "reopen":
      return owner && request.status === "COMPLETED" && request.completedAt !== null && now <= reopenDeadline(request.completedAt);
    default:
      return false;
  }
}

export function canGlobal(actor: Actor, action: GlobalAction): boolean {
  switch (action) {
    case "view_queue":
      return isSupportLead(actor) || staffRoutes(actor).length > 0;
    case "view_all":
    case "reports":
    case "settings":
      return isSupportLead(actor);
    case "export_csv":
      return actor.isAdmin;
    default:
      return false;
  }
}

/**
 * May this person be assigned a request on this route? Someone on the routed KPI committee, or a
 * support lead (Q3: every topic falls back to the support lead while a roster is empty).
 */
export function canBeAssigned(person: Actor, route: string) {
  return isOnRoute(person, route) || isSupportLead(person);
}
