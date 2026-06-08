import type { UIMessage } from "ai";

export type SessionRecord = {
  _id: string;
  userId: string;
  slugId: string;
  title: string | null;
  boxId: string | null;
  repoUrl: string;
  repoName: string;
  defaultBranch: string | null;
  branchName: string | null;
  status: "active" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type SessionsResponse = {
  sessions: SessionRecord[];
  pagination?: {
    pageSize: number;
    pageNumber: number;
    totalCount: number;
    totalPages: number;
    skip: number;
  };
  
};

export type SingleSessionResponse = {
  session: SessionRecord;
  messages: UIMessage[];
};

export type CreatePullRequestResponse = {
    success: boolean;
    url: string;
    title: string;
    body: string;
    branch: string | null;
    timestamp: string;
};