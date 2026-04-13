import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { users } from "./schema/auth";
import type { workspaces } from "./schema/workspaces";
import type { activityLog } from "./schema/activity";

// User types
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// Workspace types
export type Workspace = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;

// Activity types
export type ActivityLogEntry = InferSelectModel<typeof activityLog>;
export type NewActivityLogEntry = InferInsertModel<typeof activityLog>;
