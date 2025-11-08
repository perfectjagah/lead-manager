export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  venture: string;
  source: string;
  status: LeadStatus;
  statusId?: string;
  assignedTo?: User;
  comments: Comment[];
  adName?: string;
  adsetName?: string;
  formName?: string;
  // dynamic extra fields (question -> answer)
  extraFields?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "New"
  | "Working"
  | "Visit Confirmed"
  | "Ready to Buy"
  | "Rejected";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
}

export type UserRole = "Admin" | "SalesTeam";

export interface Comment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface ImportSummary {
  added: number;
  duplicates: number;
  errors: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
