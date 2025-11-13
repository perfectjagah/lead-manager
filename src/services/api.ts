// src/services/api.ts - OPTIMIZED VERSION

import axios, { AxiosInstance } from "axios";
import { Lead, Comment, ImportSummary, ApiResponse } from "../types";

// New Azure API base URL (use env var if provided)
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://leadmanager-api-cab5byc6ave2fnej.centralindia-01.azurewebsites.net";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: false,
  timeout: 30000,
});

// Attach bearer token automatically if available
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.token || parsed?.user?.token;
      if (token) {
        config.headers = config.headers || {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config.headers as any)["Authorization"] = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // ignore
  }
  return config;
});

// ========== CLIENT-SIDE CACHE ==========

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 60000; // 60 seconds

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  invalidate(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach((key) => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const apiCache = new APICache();

// ========== AUTH & UTILITIES ==========

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

const normalizeResponse = <T>(res: any): ApiResponse<T> => {
  const payload = res?.data;
  if (!payload) return { success: false, error: "No response" };
  // If API follows wrapper { success, data, error }
  if (typeof payload === "object" && "success" in payload) {
    return payload as ApiResponse<T>;
  }
  // Otherwise assume payload is data
  return { success: true, data: payload as T };
};

// ========== CACHED READ ENDPOINTS ==========

export const fetchStatuses = async (): Promise<ApiResponse<any[]>> => {
  try {
    const cacheKey = "statuses";
    const cached = apiCache.get<any[]>(cacheKey);
    if (cached) return { success: true, data: cached };

    const response = await api.get(`/api/Statuses`);
    const result = normalizeResponse<any[]>(response);
    if (result.success && result.data)
      apiCache.set(cacheKey, result.data, 300000);
    return result;
  } catch (error: any) {
    console.error("fetchStatuses error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch statuses",
    };
  }
};

export const fetchUsers = async (
  role?: string
): Promise<ApiResponse<any[]>> => {
  try {
    const cacheKey = role ? `users_${role}` : "users";
    const cached = apiCache.get<any[]>(cacheKey);
    if (cached) return { success: true, data: cached };

    const url = role
      ? `/api/Users?role=${encodeURIComponent(role)}`
      : `/api/Users`;
    const response = await api.get(url);
    const result = normalizeResponse<any[]>(response);
    if (result.success && result.data)
      apiCache.set(cacheKey, result.data, 300000);
    return result;
  } catch (error: any) {
    console.error("fetchUsers error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch users",
    };
  }
};

export const fetchCommentsByLead = async (
  leadId: string
): Promise<ApiResponse<Comment[]>> => {
  try {
    const cacheKey = `comments_${leadId}`;
    const cached = apiCache.get<Comment[]>(cacheKey);
    if (cached) return { success: true, data: cached };

    const response = await api.get(
      `/api/Comments/lead/${encodeURIComponent(String(leadId))}`
    );
    const result = normalizeResponse<Comment[]>(response);
    if (result.success && result.data)
      apiCache.set(cacheKey, result.data, 30000);
    return result;
  } catch (error: any) {
    console.error("fetchCommentsByLead error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch comments",
    };
  }
};
export const fetchLeads = async (
  page = 1,
  pageSize = 50,
  filters: Record<string, any> = {}
): Promise<
  ApiResponse<{
    leads: Lead[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>
> => {
  try {
    // Build cache key including filters
    const filterKey = Object.keys(filters)
      .sort()
      .map((k) => `${k}=${String(filters[k])}`)
      .join("&");
    const cacheKey = `leads_${page}_${pageSize}_${filterKey}`;
    const cached = apiCache.get<{ leads: Lead[]; total: number }>(cacheKey);
    if (cached) return { success: true, data: cached };

    const params = new URLSearchParams();
    params.append("Page", String(page));
    params.append("PageSize", String(pageSize));
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      params.append(k, String(v));
    });

    const url = `/api/Leads?${params.toString()}`;
    const response = await api.get(url);
    const payload = normalizeResponse<any>(response);
    if (!payload.success) return payload as ApiResponse<any>;

    const raw = payload.data;
    // OpenAPI returns paged result: { data: LeadDto[], totalCount, page, pageSize }
    const dataArr: any[] = (raw && raw.data) || [];
    const total =
      raw?.totalCount ?? (Array.isArray(dataArr) ? dataArr.length : 0);

    // Fetch metadata ONCE (cached)
    const [statusesResp, usersResp] = await Promise.all([
      fetchStatuses(),
      fetchUsers(),
    ]);

    const statusMap = new Map<string, string>();
    if (statusesResp.success && statusesResp.data) {
      statusesResp.data.forEach((s: any) =>
        statusMap.set(String(s.id), s.name)
      );
    }

    const userMap = new Map<string, any>();
    if (usersResp.success && usersResp.data) {
      usersResp.data.forEach((u: any) => userMap.set(String(u.id), u));
    }

    const mapped: Lead[] = (dataArr || []).map((l: any) => ({
      id: String(l.id || ""),
      name: l.name || l.full_name || "",
      email: l.email || "",
      phone: l.phone || l.phone_number || "",
      venture: l.venture || "",
      source: l.source || l.source || "",
      status: (l.statusName ||
        statusMap.get(String(l.statusId || "")) ||
        String(l.statusId || "")) as any,
      statusId: String(l.statusId || l.status || ""),
      assignedTo: userMap.get(String(l.assignedUserId || "")) || null,
      comments: [],
      adName: l.adName || l.ad_name || "",
      adsetName: l.adsetName || l.adset_name || "",
      formName: l.formName || l.form_name || "",
      extraFields:
        typeof l.extraFields === "string"
          ? (() => {
              try {
                return JSON.parse(l.extraFields || "{}");
              } catch {
                return { misc: String(l.extraFields || "") };
              }
            })()
          : l.extraFields || {},
      createdAt: l.createdAt || l.created_time || "",
      updatedAt: l.updatedAt || "",
    }));

    const result = {
      leads: mapped,
      total,
      page: raw?.page || page,
      pageSize: raw?.pageSize || pageSize,
    };
    apiCache.set(cacheKey, result, 60000);
    return { success: true, data: result };
  } catch (error: any) {
    console.error("fetchLeads error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch leads",
    };
  }
};

export const fetchLeadsByStatus = async (
  statusId: string,
  limit = 50,
  page = 1,
  salesUserId?: string
): Promise<ApiResponse<{ leads: Lead[]; total: number }>> => {
  const filters: Record<string, any> = { StatusId: statusId };
  if (salesUserId) filters.AssignedUserId = salesUserId;
  return fetchLeads(page, limit, filters) as Promise<
    ApiResponse<{ leads: Lead[]; total: number }>
  >;
};

// ========== MUTATION ENDPOINTS (Clear Cache) ==========

export const updateLeadStatus = async (
  leadId: string,
  statusId: string
): Promise<ApiResponse<any>> => {
  try {
    const res = await api.patch(
      `/api/Leads/${encodeURIComponent(String(leadId))}/status`,
      { statusId }
    );
    apiCache.invalidate("leads");
    return normalizeResponse(res);
  } catch (error: any) {
    console.error("updateLeadStatus error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to update lead status",
    };
  }
};

export const addComment = async (
  leadId: string,
  text: string
): Promise<ApiResponse<any>> => {
  try {
    const res = await api.post(`/api/Comments`, { leadId, text });
    apiCache.invalidate(`comments_${leadId}`);
    return normalizeResponse(res);
  } catch (error: any) {
    console.error("addComment error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to add comment",
    };
  }
};

export const assignLead = async (
  leadId: string,
  userId: string
): Promise<ApiResponse<any>> => {
  try {
    const res = await api.patch(
      `/api/Leads/${encodeURIComponent(String(leadId))}/assign`,
      { userId }
    );
    apiCache.invalidate("leads");
    return normalizeResponse(res);
  } catch (error: any) {
    console.error("assignLead error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to assign lead",
    };
  }
};

export const importLeads = async (
  leadsArray: Partial<Lead>[]
): Promise<ApiResponse<ImportSummary>> => {
  try {
    // Try bulk import endpoints first (common patterns). If not supported, fallback to creating per-lead.
    try {
      const res = await api.post(`/api/Leads/import`, { leads: leadsArray });
      apiCache.invalidate("leads");
      return normalizeResponse(res);
    } catch (err) {
      // try alternate path
    }

    try {
      const res2 = await api.post(`/api/Leads/bulk`, { leads: leadsArray });
      apiCache.invalidate("leads");
      return normalizeResponse(res2);
    } catch (err) {
      // fallback to per-lead creation
    }

    const results: any[] = [];
    for (const l of leadsArray) {
      const r = await api
        .post(`/api/Leads`, l)
        .catch((e) => ({ success: false, error: e }));
      results.push((r as any)?.data || r);
    }
    apiCache.invalidate("leads");
    return { success: true, data: { imported: results.length } as any };
  } catch (error: any) {
    console.error("importLeads error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to import leads",
    };
  }
};

// ========== AUTHENTICATION ==========

export const login = async (
  username: string,
  password: string
): Promise<ApiResponse<{ token: string; user: any }>> => {
  try {
    const response = await api.post(`/api/Auth/login`, { username, password });
    const payload = normalizeResponse<any>(response);
    if (!payload.success)
      return { success: false, error: payload.error || "Invalid credentials" };

    // payload.data may be the LoginResponseDto or the inner data depending on server wrapper
    let loginData = payload.data;
    if (loginData && loginData.data) loginData = loginData.data;

    if (loginData && loginData.token) {
      const userObj = { ...(loginData.user || {}), token: loginData.token };
      localStorage.setItem("user", JSON.stringify(userObj));
      return {
        success: true,
        data: { token: loginData.token, user: loginData.user },
      };
    }

    return { success: false, error: "Invalid credentials" };
  } catch (error: any) {
    console.error("login error:", error);
    return {
      success: false,
      error: error?.response?.data?.error || error?.message || "Login failed",
    };
  }
};

export const logout = (): void => {
  localStorage.removeItem("user");
  apiCache.clear();
  window.location.href = "/";
};

export const testAPI = async (): Promise<ApiResponse<any>> => {
  try {
    const response = await axios.get(API_BASE_URL);
    return normalizeResponse(response);
  } catch (error: any) {
    console.error("testAPI error:", error);
    return {
      success: false,
      error: error?.response?.data?.error || error?.message || "Test failed",
    };
  }
};

// ========== DEPRECATED - Use fetchCommentsByLead instead ==========
export const fetchComments = async (): Promise<ApiResponse<Comment[]>> => {
  console.warn(
    "fetchComments() is deprecated. Use fetchCommentsByLead(leadId) instead."
  );
  return { success: false, error: "Use fetchCommentsByLead(leadId)" };
};
