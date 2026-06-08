import type { AuthResponse, LoginType, RegisterType } from "@/types/auth.type";
import API from "./axios-client";
import type { CreatePullRequestResponse, SessionsResponse, SingleSessionResponse } from "@/types/session.type";
import type { GithubConnectResponse, GithubReposResponse } from "@/types/github.type";


export const loginMutationFn = async (data:LoginType):Promise<AuthResponse> => {
    const response = await API.post<AuthResponse>("/auth/login", data);
    return response.data
}


export const registerMutationFn = async (data: RegisterType): Promise<AuthResponse> => {
    const response = await API.post<AuthResponse>("/auth/register", data);
    return response.data;
}

export const getCurrentUser = async (): Promise<AuthResponse> => {
    const response = await API.get<AuthResponse>("/auth/me");
    return response.data;
}

export const getUserSessions = async (): Promise<SessionsResponse> => {
    const response = await API.get<SessionsResponse>("/session/all");
    return response.data;
};

export const getGithubRepos = async (): Promise<GithubReposResponse> => {
    const response = await API.get<GithubReposResponse>("/github/repos");
    return response.data;
};

export const connectGithub = async (redirectTo?: string): Promise<GithubConnectResponse> => {
    const response = await API.get<GithubConnectResponse>("/github/connect", {
        params: redirectTo ? { redirectTo } : undefined,
    });
    return response.data;
};

export const createSessionPullRequest = async (
    slugId: string,
    data: { title?: string; body?: string }
): Promise<CreatePullRequestResponse> => {
    const response = await API.post<CreatePullRequestResponse>(`/session/${slugId}/pr`, data);
    return response.data;
};


export const getSessionBySlug = async (slugId: string): Promise<SingleSessionResponse> => {
    const response = await API.get<SingleSessionResponse>(`/session/${slugId}`);
    return response.data;
};

export const getUserSessionsWithSearch = async (params?: {
    search?: string;
    pageSize?: number;
    pageNumber?: number;
}): Promise<SessionsResponse> => {
    const response = await API.get<SessionsResponse>("/session/all", {
        params,
    });
    return response.data;
};

export const logoutMutationFn = async (): Promise<{ message: string }> => {
    const response = await API.post<{ message: string }>("/auth/logout");
    return response.data;
};

export const getSessionProcesses = async (slugId: string): Promise<{ processes: Record<string, unknown>[] }> => {
    const response = await API.get(`/session/${slugId}/processes`);
    return response.data;
};

export const getGoalState = async (slugId: string): Promise<{ state: any }> => {
    const response = await API.get(`/session/${slugId}/goal`);
    return response.data;
};

export const executeGoalAction = async (slugId: string, payload: any): Promise<{ result: any, state: any }> => {
    const response = await API.post(`/session/${slugId}/goal`, payload);
    return response.data;
};
