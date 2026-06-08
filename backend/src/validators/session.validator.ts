import {z} from "zod";

export const sessionAllQuerySchema = z.object({
  search: z.string().optional(),
  pageSize: z.coerce.number().int().positive().default(20),
  pageNumber: z.coerce.number().int().positive().default(1),
});


export const getSessionBySlugIdSchema = z.object({
  slugId: z.string().min(1),
});

export const sessionChatSchema = z.object({
  messages: z.array(z.any()), 
  slugId: z.string(),
  repoUrl: z.string().optional().default(''),
  defaultBranch: z.string().optional(),
  workspaceType: z.enum(['github', 'local']).optional().default('github'),
  localPath: z.string().optional(),
});

export const createPullRequestSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
});
