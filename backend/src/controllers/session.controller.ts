import { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http-status.config";
import {
  createPullRequestSchema,
  getSessionBySlugIdSchema,
  sessionAllQuerySchema,
  sessionChatSchema,
} from "../validators/session.validator";
import {
  createPullRequestService,
  getSessionBySlugIdService,
  getUserSessionService,
  sessionChatService,
  getSessionProcessesService,
} from "../services/session.service";

export const getUserSessionController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { search, pageSize, pageNumber } = sessionAllQuerySchema.parse(
      req.query,
    );
    const data = await getUserSessionService(userId, {
      search,
      pageSize,
      pageNumber,
    });
    return res.status(HTTPSTATUS.OK).json({
      message: "User sessions retrieved successfully",
      ...data,
    });
  },
);

export const getSessionBySlugIdController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { slugId } = getSessionBySlugIdSchema.parse(req.params);
    const data = await getSessionBySlugIdService(userId, slugId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Session retrieved successfully",
      ...data,
    });
  },
);

export const sessionChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { messages, slugId, repoUrl, defaultBranch } =
      sessionChatSchema.parse(req.body);
    // local workspace uchun qo'shimcha fieldlar
    const workspaceType = (req.body.workspaceType as 'github' | 'local') || 'github';
    const localPath = req.body.localPath as string | undefined;

      const abortController = new AbortController();
      res.on("close", () => {
        abortController.abort();
      });
    return await sessionChatService(
      userId,
      slugId,
      repoUrl || '',
      defaultBranch,
      messages,
      abortController.signal,
      res,
      workspaceType,
      localPath,
    );
  },
);

export const createPullRequestController = asyncHandler(
  async (req:Request, res:Response) => {
    const userId = req.user?._id;
     const { slugId } = getSessionBySlugIdSchema.parse(req.params);
     const {title, body} = createPullRequestSchema.parse(req.body);

     const data  = await createPullRequestService(
      userId,
      slugId,
      title,
      body
     )

     return res.status(HTTPSTATUS.OK).json({
      ...data,
     })
  }
)

export const getSessionProcessesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { slugId } = getSessionBySlugIdSchema.parse(req.params);
    const data = await getSessionProcessesService(userId, slugId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Session processes retrieved successfully",
      ...data,
    });
  },
);

const execAsync = promisify(exec);

export const pickFolderController = asyncHandler(async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Folder picker is only available in local development" });
  }

  if (process.platform !== "darwin") {
    return res.status(400).json({ error: "Folder picker is currently only supported on macOS" });
  }

  try {
    const { stdout } = await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "Select project folder for XAgent")'`);
    const folderPath = stdout.trim();
    if (!folderPath) {
       return res.status(400).json({ error: "No folder selected" });
    }
    return res.status(200).json({ path: folderPath });
  } catch (error: any) {
    if (error.message?.includes("User canceled")) {
      return res.status(400).json({ error: "User canceled folder selection" });
    }
    console.error("Folder picker error:", error);
    return res.status(500).json({ error: "Failed to open folder picker" });
  }
});