import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  registerController,
  loginController,
  logoutController,
  authStatusController
} from "../controllers/auth.controller";

const authRoute = Router();

authRoute.post("/register", registerController);
authRoute.post("/login", loginController);
authRoute.post("/logout", logoutController);
authRoute.get("/me", passportAuthenticateJwt, authStatusController);

export default authRoute;
