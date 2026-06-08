import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http-status.config";
import {
  getGithubConnectUrl,
  githubCallbackService,
  disconnectGithub,
  getGithubReposService,
} from "../services/github.service";
import { githubCallbackQuerySchema } from "../validators/github.validator";

export const githubConnectController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    const { redirectTo } = req.query as { redirectTo?: string };

    const url = getGithubConnectUrl(userId, redirectTo);
    return res.status(HTTPSTATUS.OK).json({
      message: "GitHub connect URL generated successfully",
      url,
    });
  }
);

export const githubCallbackController = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state } = githubCallbackQuerySchema.parse(req.query);
    const { redirectTo } = await githubCallbackService(code, state);
    return res.redirect(redirectTo);
  }
);

export const getGithubReposController = asyncHandler(
    async (req:Request, res:Response) => {
        const userId = req.user?._id;
        const data = await getGithubReposService(userId);
        return res.status(HTTPSTATUS.OK).json(data)
    }
)

export const githubDisconnectController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    await disconnectGithub(userId);
   return res.status(HTTPSTATUS.OK).json({
      message: "GitHub account disconnected successfully",
    });
  }
);
