import { getEnv } from "../utils/get-env";

const envConfig = {
  NODE_ENV: getEnv("NODE_ENV", "development"),
  PORT: getEnv("PORT", "8000"),
    BASE_URL: getEnv("BASE_URL"),
    
  MONGO_URI: getEnv("MONGO_URI"),
  JWT_SECRET: getEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: getEnv("JWT_EXPIRES_IN", "7d"),

  GITHUB_CLIENT_ID: getEnv("GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: getEnv("GITHUB_CLIENT_SECRET"),
  GITHUB_OAUTH_STATE_SECRET: getEnv("GITHUB_OAUTH_STATE_SECRET"),
  GITHUB_TOKEN_ENCRYPTION_KEY: getEnv("GITHUB_TOKEN_ENCRYPTION_KEY"),
  
  FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN"),
};

export default envConfig;
