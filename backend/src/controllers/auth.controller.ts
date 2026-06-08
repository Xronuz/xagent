import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { registerService, loginService } from "../services/auth.service";
import { clearJwtAuthCookie, setJwtAuthCookie } from "../utils/cookie";
import { loginSchema, registerSchema } from "../validators/auth.validator";
import { HTTPSTATUS } from "../config/http-status.config";
import GithubAccount from "../models/github-account.model";

const toAuthUser = (user: any) => ({
  _id: String(user._id),
  name: user.name,
  email: user.email,
  avatar: user.avatar ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const registerController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = registerSchema.parse(req.body);
    const user = await registerService(body);
    const userId = user._id.toString();

    return setJwtAuthCookie({ res, userId })
    .status(HTTPSTATUS.CREATED)
    .json({
      message: "User registered successfully",
      user,
    });
  },
);

export const loginController = asyncHandler(
  async (req: Request, res: Response) => {
   const body = loginSchema.parse(req.body);
    const user = await loginService(body);
    const userId = user._id.toString();
   return setJwtAuthCookie({ res, userId })
    .status(HTTPSTATUS.OK)
    .json({
      message: "User login successfully",
      user,
    });
});

export const logoutController = asyncHandler(async (_req: Request, res: Response) => {
  return clearJwtAuthCookie(res).status(HTTPSTATUS.OK).json({
     message: "User logged out successfully",
  });
});

export const authStatusController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user;
    console.log(user,"user")
    const userId = user?._id ? user._id.toString() : null
    let githubConnected = false;
    if(userId){
      const isExist = await GithubAccount.exists({userId})
      githubConnected = Boolean(isExist)
    }

  res.json({
    message: "Authenticated",
    user: user ? {...toAuthUser(user), githubConnected} : null
  });
});
