import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const requests = sqliteTable("requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestNumber: text("request_number").notNull().unique(),
  categoryCode: text("category_code").notNull(),
  categoryLabel: text("category_label").notNull(),
  memberName: text("member_name").notNull(),
  memberEmail: text("member_email").notNull(),
  priority: text("priority").notNull().default("Normal"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("RECEIVED"),
  leadContact: text("lead_contact")
    .notNull()
    .default("KP Digital & Technology Committee"),
  committeeNotes: text("committee_notes")
    .notNull()
    .default("Your request has been received and is waiting for review."),
  attachmentKey: text("attachment_key"),
  attachmentName: text("attachment_name"),
  attachmentType: text("attachment_type"),
  sheetSyncStatus: text("sheet_sync_status").notNull().default("NOT_CONFIGURED"),
  emailReceiptStatus: text("email_receipt_status").notNull().default("NOT_CONFIGURED"),
  syncError: text("sync_error"),
  lastSyncedAt: text("last_synced_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestNumber: text("request_number").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const requestActivity = sqliteTable("request_activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestNumber: text("request_number").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull().default(""),
  actorEmail: text("actor_email").notNull().default("system"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
