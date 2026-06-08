import { Response } from "express";
import jwt from "jsonwebtoken";
import envConfig from "../config/env.config";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type Time = `${number}${"s" | "m" | "h" | "d" | "w" | "y"}`;
type Cookie = {
  res: Response;
  userId: string;
};

export function setJwtAuthCookie({res, userId}:Cookie) {
  const payload = { userId };
  const expiresIn = envConfig.JWT_EXPIRES_IN as Time;
  const token = jwt.sign(payload, envConfig.JWT_SECRET, {
     audience: ["user"],
     expiresIn
     });

 return res.cookie("accessToken", token, {
    maxAge: SEVEN_DAYS,
    httpOnly: true,
    secure: envConfig.NODE_ENV === "production",
    sameSite: envConfig.NODE_ENV === "production" ? "strict" : "lax",
  });
}

export function clearJwtAuthCookie(res: Response) {
  return res.clearCookie("accessToken", {path: "/"});
}
