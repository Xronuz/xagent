import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  getGoalStateController,
  executeGoalActionController
} from "../controllers/goal.controller";

const goalRoutes = Router()
  .get("/:slugId/goal", passportAuthenticateJwt, getGoalStateController)
  .post("/:slugId/goal", passportAuthenticateJwt, executeGoalActionController);

export default goalRoutes;
