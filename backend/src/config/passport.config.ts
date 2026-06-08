import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Request } from "express";
import envConfig from "../config/env.config";
import { findUserById } from "../services/user.service";

const cookieExtractor = (req: Request) => {
  return req?.cookies?.accessToken ?? null;
};

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
  secretOrKey: envConfig.JWT_SECRET,
  audience: ["user"],
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload: { userId: string }, done) => {
    try {
      const user = await findUserById(payload.userId);
      if (user) {
        return done(null, user);
      }
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  })
);

export default passport;

export const passportAuthenticateJwt = passport.authenticate("jwt", {
  session: false,
});