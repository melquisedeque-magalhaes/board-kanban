import type { Priority, CardType, Blocker } from "@prisma/client";
export type { Priority, CardType, Blocker };

export interface CardFilter {
  /** id ou nome do board. Escopa a busca e o columnName; sem ele, columnName
   *  resolve no board default e a busca sem coluna varre todos os boards. */
  board?: string;
  columnId?: string;
  columnName?: string;
  assignee?: string; // nome ou id
  priority?: Priority;
  type?: CardType;
}
export interface CreateCardInput {
  board?: string; // id ou nome; escopa columnName (default: board principal)
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
  bot?: boolean; // card em operação por um agente
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
  bot?: boolean; // card em operação por um agente
}
