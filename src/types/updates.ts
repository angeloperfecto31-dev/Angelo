export type UpdateCategory =
  | "New Features"
  | "Improvements"
  | "Bug Fixes"
  | "Maintenance"
  | "Security Updates"
  | "General Announcements";

export type UpdateVisibility = "all" | "premium" | "basic";

export interface WebsiteUpdate {
  id: string;
  title: string;
  description: string;
  category: UpdateCategory;
  version: string;
  releasedAt: string; // ISO string
  visibility: UpdateVisibility;
  detailedNotes?: string;
  isPinned?: boolean;
  viewsCount?: number;
  createdBy?: string;
  createdAt?: string;
}

export interface UserUpdateReadState {
  updateId: string;
  read: boolean;
  readAt?: string;
}
