import type { Priority, CardType, Blocker } from "@prisma/client";
export type { Priority, CardType, Blocker };

export interface CardFilter {
  columnId?: string;
  columnName?: string;
  assignee?: string; // nome ou id
  priority?: Priority;
  type?: CardType;
}
export interface CreateCardInput {
  columnId?: string;
  columnName?: string;
  title: string;
  description?: string; // alias legado → dobra em details
  details?: string;
  priority?: Priority;
  type?: CardType;
  version?: string;
  branchUrl?: string;
  requestedBy?: string; // id, nome ou e-mail
  code?: string;
  documentation?: string;
  assignees?: string[]; // nomes ou ids
  labels?: string[];    // nomes ou ids
  parentId?: string;
  blocker?: Blocker;
  blockerReason?: string;
}
export interface UpdateCardInput {
  title?: string;
  description?: string; // alias legado → dobra em details
  details?: string | null;
  priority?: Priority | null;
  type?: CardType | null;
  version?: string | null;
  branchUrl?: string | null;
  requestedBy?: string | null; // id, nome ou e-mail
  code?: string | null;
  documentation?: string | null;
  dueDate?: string | Date | null;
  assignees?: string[];
  labels?: string[];
  parentId?: string | null;
  blocker?: Blocker | null;
  blockerReason?: string | null;
}
