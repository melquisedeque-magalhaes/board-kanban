import type { Priority } from "@prisma/client";
export type { Priority };

export interface CardFilter {
  columnId?: string;
  columnName?: string;
  assignee?: string; // nome ou id
  priority?: Priority;
}
export interface CreateCardInput {
  columnId?: string;
  columnName?: string;
  title: string;
  description?: string;
  priority?: Priority;
  code?: string;
  assignees?: string[]; // nomes ou ids
  labels?: string[];    // nomes ou ids
}
export interface UpdateCardInput {
  title?: string;
  description?: string;
  priority?: Priority | null;
  code?: string | null;
  dueDate?: string | Date | null;
  assignees?: string[];
  labels?: string[];
}
