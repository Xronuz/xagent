import envConfig from "../../config/env.config";
import { createOAuthState } from "./state";

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_SCOPES = ["repo", "read:user", "read:org"];

const GITHUB_REDIRECT_URI = `${envConfig.BASE_URL}/api/github/callback`;

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url:string;
  description: string | null;
  default_branch: string;
  fork: boolean;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
};

export function createGithubConnectUrl(data:{
    userId: string;
    redirectTo?: string;
}){
    const state = createOAuthState({
        userId: data.userId,
        redirectTo: data.redirectTo,
    });
    const params = new URLSearchParams({
        client_id: envConfig.GITHUB_CLIENT_ID,
        redirect_uri: GITHUB_REDIRECT_URI,
        response_type: "code",
        scope: GITHUB_SCOPES.join(" "),
        state,
        allow_signup: "true",
    });
    return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

async function requestGithubToken(params: URLSearchParams) {
    const response = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "XAgent",
        },
        body: params.toString(),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${data.error_description || data.error}`);
    }
    return data;
}

export async function exchangeGithubCodeForToken(code: string){
    const params = new URLSearchParams({
        client_id: envConfig.GITHUB_CLIENT_ID,
        client_secret: envConfig.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
    })
    const data = await requestGithubToken(params);
    const expiresIn = Number(data.expires_in);

    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
    }
}

export async function refreshGithubToken(refreshToken: string){
    const params = new URLSearchParams({
        client_id: envConfig.GITHUB_CLIENT_ID,
        client_secret: envConfig.GITHUB_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    })
    const data = await requestGithubToken(params);
    const expiresIn = Number(data.expires_in);

    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
    }
}

export async function getGithubUser(accessToken: string) {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "XAgent",
        },
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();

    return {
        githubId: data.id.toString(),
        githubLogin: data.login,
    }
}

export async function getGithubRepos(accessToken: string) {
    const repos: GithubRepo[] = [];
    let page = 1;

    while (true) {
        const response = await fetch(
            `${GITHUB_API_URL}/user/repos?per_page=100&page=${page}
            &sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "XAgent",
                }
            }
        )

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
        }

        const pageRepos: GithubRepo[] = await response.json();
        repos.push(...pageRepos);

        if(!response.headers.get("Link")?.includes('rel="next"')) {
            break;
        }
        page++;
    }

    return repos;
}