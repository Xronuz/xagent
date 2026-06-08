import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
githubConnectController,
githubCallbackController,
getGithubReposController,
githubDisconnectController
} from "../controllers/github.controller";

const githubRoutes = Router()
    .get("/connect", passportAuthenticateJwt, githubConnectController)
    .get("/callback", githubCallbackController)
    .get("/repos", passportAuthenticateJwt,getGithubReposController)
    .delete("/disconnect", passportAuthenticateJwt, githubDisconnectController);

export default githubRoutes;
