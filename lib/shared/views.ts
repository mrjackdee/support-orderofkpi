// Shapes the server sends to pages. A member's view never carries internal notes or internal
// history: those live only in StaffExtras, which is built only for staff (BR-34).

export type FileView = {
  id: number;
  name: string;
  mime: string;
  bytes: number;
  uploadedBy: string;
  createdAt: number;
};

export type ConversationItem =
  | {
      kind: "message";
      id: number;
      authorName: string;
      authorRole: "member" | "staff" | "system";
      body: string;
      createdAt: number;
      files: FileView[];
    }
  | { kind: "event"; id: number; text: string; createdAt: number };

export type MemberRequestView = {
  number: string;
  topicCode: string;
  topicLabel: string;
  subject: string;
  description: string;
  urgency: string;
  status: string;
  statusLabel: string;
  committeeName: string;
  leadContact: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  reopenUntil: number | null;
  isOwner: boolean;
  canReply: boolean;
  canWithdraw: boolean;
  canReopen: boolean;
  files: FileView[];
  conversation: ConversationItem[];
};

export type NoteView = { id: number; authorName: string; body: string; createdAt: number };
export type HistoryView = { id: number; text: string; actorName: string; createdAt: number; memberVisible: boolean };
export type PersonOption = { email: string; name: string };

export type StaffExtras = {
  requesterName: string;
  requesterEmail: string;
  routedCommittee: string;
  chosenCommittee: string | null;
  assigneeEmail: string | null;
  responseDueAt: number;
  firstResponseAt: number | null;
  pastTarget: boolean;
  notes: NoteView[];
  history: HistoryView[];
  assignable: PersonOption[];
  canAssign: boolean;
  canReroute: boolean;
  canSetStatus: boolean;
  canStaffReply: boolean;
  canNote: boolean;
};

export type RequestView = { request: MemberRequestView; staff?: StaffExtras };

export type RequestSummary = {
  number: string;
  topicCode: string;
  topicLabel: string;
  subject: string;
  urgency: string;
  status: string;
  statusLabel: string;
  committeeName: string;
  createdAt: number;
  updatedAt: number;
};

export type QueueRow = RequestSummary & {
  requesterName: string;
  requesterEmail: string;
  routedCommittee: string;
  assigneeName: string | null;
  ageDays: number;
  pastTarget: boolean;
};
