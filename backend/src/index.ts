import "dotenv/config"
import express,{ Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path"
// import compression from "compression"; 
// import helmet from "helmet";
// import morgan from "morgan";
import envConfig from "./config/env.config";
import { asyncHandler } from "./middlewares/asyncHandler.middleware";
import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { connectDatabase } from "./config/database.config";
import passport from "./config/passport.config";

const app = express();

// app.use(helmet());
// app.use(compression());
// app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [envConfig.FRONTEND_ORIGIN],
    methods: ["GET", "POST", "PUT", "DELETE"], 
    credentials: true,
  })
);

app.use(passport.initialize());

app.get(
  "/health",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ message: "Server is running", status: "healthy" });
  })
);

app.use("/api", routes);

if (envConfig.NODE_ENV === "production") {
  const clientPath = path.resolve(__dirname, "../../client/dist");

  //Serve static files
  app.use(express.static(clientPath));

  app.get(/^(?!\/api).*/, (req: Request, res: Response) => {
    res.sendFile(path.join(clientPath, "index.html"));
  });
}

app.use(errorHandler);

app.use(errorHandler);

app.listen(envConfig.PORT, async () => {
  await connectDatabase()
  console.log(`Server running on http://localhost:${envConfig.PORT} in ${envConfig.NODE_ENV} mode`);
});
