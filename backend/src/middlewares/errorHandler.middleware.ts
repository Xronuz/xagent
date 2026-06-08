import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HTTPSTATUS } from "../config/http-status.config";
import { AppError, ErrorCodes } from "../utils/app-error";

function formatZodError(error: ZodError) {
  return error.issues.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}

export function errorHandler(
  err: Error,
  _req: Request, 
  res: Response,
  _next: NextFunction
) {
  console.log("Error occoured" ,err)
  if (err instanceof ZodError) {
    return res.status(HTTPSTATUS.BAD_REQUEST).json({
      message: "Validation failed",
      errorCode: "ERR_VALIDATION",
      errors: formatZodError(err),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
      errorCode: err.errorCode,
    });
  }

 
  return res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
    message: "Internal Server Error",
    error: err.message,
    errorCode: ErrorCodes.ERR_INTERNAL,
  });
}
