import { Router } from "express";
import authRoute from "./auth.route";
import githubRoutes from "./github.route";
import sessionRoutes from "./session.route"
import goalRoutes from "./goal.route"

const router = Router();

router.use("/auth", authRoute);
router.use("/github", githubRoutes);
router.use("/session", sessionRoutes);
router.use("/session", goalRoutes);

export default router;
