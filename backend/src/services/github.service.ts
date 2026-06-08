import mongoose from "mongoose";
import GithubAccount from "../models/github-account.model";
import { encryptToken, decryptToken } from "../lib/social-oauth/encryption";
import { createGithubConnectUrl, getGithubRepos } from "../lib/social-oauth";
import {
  exchangeGithubCodeForToken,
  getGithubUser,
  refreshGithubToken,
} from "../lib/social-oauth";
import { verifyOAuthState } from "../lib/social-oauth/state";
import { BadRequestException, NotFoundException, UnauthorizedException } from "../utils/app-error";
import envConfig from "../config/env.config";

export const getGithubConnectUrl = (userId: string, redirectTo?: string) => {
  if (!userId) throw new UnauthorizedException("Authentication required to connect GitHub account");
  return createGithubConnectUrl({ userId, redirectTo });
};

export const githubCallbackService = async (
  code: string,
  state: string
) => {

  const { userId, redirectTo } = verifyOAuthState(state);
  const tokenData = await exchangeGithubCodeForToken(code);
  const userData = await getGithubUser(tokenData.accessToken);
  
  await GithubAccount.findOneAndUpdate(
    { userId: userId },
    {
      githubId: userData.githubId,
      githubLogin: userData.githubLogin,
      accessToken: encryptToken(tokenData.accessToken),
      refreshToken: tokenData.refreshToken ? encryptToken(tokenData.refreshToken) : null,
      tokenExpiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt) : null,
    },
    { upsert: true, new: true }
  );
 const redirectUrl = redirectTo ? redirectTo : `${envConfig.FRONTEND_ORIGIN}/new?github=connected`
  return {
    redirectTo: redirectUrl,
  };
};

export const getGithubAccessToken = async (userId: string) => {
  const account = await GithubAccount.findOne({
    userId,
  });
  if (!account) {
    throw new NotFoundException("GitHub account not connected");
  }

  if (
    account.tokenExpiresAt &&
    account.tokenExpiresAt <= new Date() &&
    account.refreshToken
  ) {
    const decryptedRefresh = decryptToken(account.refreshToken);
    try {
      const refreshed = await refreshGithubToken(decryptedRefresh);

      account.accessToken = encryptToken(refreshed.accessToken);
      if (refreshed.refreshToken) {
        account.refreshToken = encryptToken(refreshed.refreshToken);
      }
      account.tokenExpiresAt = refreshed.expiresAt
        ? new Date(refreshed.expiresAt)
        : null;
      await account.save();
    } catch {
      throw new BadRequestException("Failed to refresh GitHub token");
    }
  }

  const accessToken =  decryptToken(account.accessToken);
  return accessToken
};

export const getGithubReposService = async (userId:string)=>{
  if(!userId) throw new UnauthorizedException("Unauthorized");

  const accessToken = await getGithubAccessToken(userId);
  const repos = await getGithubRepos(accessToken);

   const mappedRepos = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
      defaultBranch: repo.default_branch,
      description: repo.description,
      fork: repo.fork,
      // owner: {
      //   login: repo.owner.login,
      //   avatarUrl: repo.owner.avatar_url,
      //   htmlUrl: repo.owner.html_url,
      // },
    }))

  return {
    repos:mappedRepos
  }
}

export const disconnectGithub = async (userId: string) => {
  const account = await GithubAccount.findOne({
    userId
  });
  if (!account) {
    throw new NotFoundException("GitHub account not connected");
  }
  await account.deleteOne();
  return {connected: false}
};
