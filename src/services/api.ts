// src/services/api.ts
import axios, { AxiosInstance } from "axios";
import {
  Lead,
  LeadStatus,
  Comment,
  ImportSummary,
  ApiResponse,
} from "../types";

/**
 * API client for Google Apps Script backend
 * Uses application/x-www-form-urlencoded to avoid CORS preflight
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://script.google.com/macros/s/AKfycbzRSiIfYR7oRHE1PCKgovxd6gM08hGBBmFDTvcOqEKX_HD_U4Kj1UiDE6PNtQ5vLmHb/exec";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  withCredentials: false,
});

// Response interceptor for 401 errors
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

// Get authentication token from localStorage
const getToken = (): string | undefined => {
  const raw = localStorage.getItem("user");
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed) return undefined;

    if (typeof parsed === "object") {
      if (parsed.token) return String(parsed.token);
      if (parsed.user?.token) return String(parsed.user.token);
    }
    return undefined;
  } catch {
    return undefined;
  }
};

// Helper to POST actions with URLSearchParams
const postAction = async (
  action: string,
  payload: Record<string, any> = {}
): Promise<any> => {
  const token = getToken();
  const bodyObj: Record<string, any> = { action, ...payload };
  if (token) bodyObj.token = token;

  const params = new URLSearchParams();
  Object.entries(bodyObj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.append(
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value)
    );
  });

  return api.post("", params); // POST to root
};

// Normalize API responses
const normalizeResponse = <T = any>(res: any): ApiResponse<T> => {
  const payload = res?.data;
  if (!payload) return { success: false, error: "No response" };

  if (typeof payload === "object" && "success" in payload) {
    return payload as ApiResponse<T>;
  }

  return { success: true, data: payload as T };
};

// ============================================
// READ ENDPOINTS
// ============================================

export const fetchStatuses = async (): Promise<ApiResponse<LeadStatus[]>> => {
  try {
    const response = await axios.get(`${API_BASE_URL}?path=statuses`);
    return normalizeResponse<LeadStatus[]>(response);
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

export const fetchUsers = async (): Promise<ApiResponse<any[]>> => {
  try {
    const response = await axios.get(`${API_BASE_URL}?path=users`);
    return normalizeResponse<any[]>(response);
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

export const fetchComments = async (): Promise<ApiResponse<Comment[]>> => {
  try {
    const response = await axios.get(`${API_BASE_URL}?path=comments`);
    return normalizeResponse<Comment[]>(response);
  } catch (error: any) {
    console.error("fetchComments error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch comments",
    };
  }
};

// fetchLeads supports optional pagination (page, pageSize). If no pagination is sent
// it behaves like before and returns the full list (but server-side should honor paging).
export const fetchLeads = async (
  page = 1,
  pageSize = 10
): Promise<
  ApiResponse<{
    leads: Lead[];
    total?: number;
    page?: number;
    pageSize?: number;
  }>
> => {
  try {
    debugger;
    const token = getToken();
    const base = `${API_BASE_URL}?path=leads`;
    const url = token
      ? `${base}&token=${token}&page=${page}&pageSize=${pageSize}`
      : `${base}&page=${page}&pageSize=${pageSize}`;

    const response = await axios.get(url);
    const payload = normalizeResponse<any>(response);
    if (!payload.success) return payload as ApiResponse<any>;

    // Map incoming raw records into Lead[] using similar logic to fetchLeadsByStatus
    const raw = payload.data;
    let leadsArr: any[] = [];
    let total: number | undefined = undefined;
    if (Array.isArray(raw)) {
      leadsArr = raw;
      total = raw.length;
    } else if (raw && (raw.leads || raw.data)) {
      leadsArr = raw.leads || raw.data || [];
      total = typeof raw.total === "number" ? raw.total : leadsArr.length;
    }

    // enrich with statuses/users/comments similar to bulk mapping
    const [statusesResp, usersResp, commentsResp] = await Promise.all([
      fetchStatuses(),
      fetchUsers(),
      fetchComments(),
    ]);

    const commentsByLead = new Map<string, Comment[]>();
    if (commentsResp.success && commentsResp.data) {
      commentsResp.data.forEach((c: any) => {
        const leadId = String(c.leadId || "");
        const commentObj: Comment = {
          id: String(c.id || ""),
          text: c.text || "",
          userId: String(c.userId || ""),
          userName: c.userName || "",
          createdAt: c.createdAt || "",
        };
        const arr = commentsByLead.get(leadId) || [];
        arr.push(commentObj);
        commentsByLead.set(leadId, arr);
      });
    }

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

    const mapped: Lead[] = (leadsArr || []).map((l: any) => ({
      id: String(l.id || ""),
      name: l.name || l.full_name || "",
      email: l.email || "",
      phone: l.phone || l.phone_number || "",
      venture: l.venture || "",
      source: l.source || "",
      status: (statusMap.get(String(l.statusId || "")) ||
        String(l.statusId || "")) as any,
      statusId: String(l.statusId || l.status || ""),
      assignedTo: userMap.get(String(l.assignedUserId || "")) || null,
      comments: commentsByLead.get(String(l.id || "")) || [],
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

    return {
      success: true,
      data: { leads: mapped, total, page, pageSize },
    };
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

// Fetch leads for a single status with server-side pagination (limit & offset)
export const fetchLeadsByStatus = async (
  statusId: string,
  limit = 10,
  offset = 0,
  salesUserId?: string
): Promise<ApiResponse<{ leads: Lead[]; total: number }>> => {
  try {
    const url = `${API_BASE_URL}?path=leads&statusId=${encodeURIComponent(
      String(statusId)
    )}&limit=${limit}&offset=${offset}${
      salesUserId ? `&userId=${encodeURIComponent(String(salesUserId))}` : ""
    }`;
    const response = await axios.get(url);
    const payload = normalizeResponse<any>(response);
    if (!payload.success) return payload as ApiResponse<any>;

    // The server should return { data: { leads: [...], total: N } } or an array
    const data = payload.data;

    // If server returns array of leads, wrap into { leads: array, total: array.length }
    if (Array.isArray(data)) {
      return {
        success: true,
        data: { leads: data as any[], total: data.length },
      };
    }

    // If server returns object with leads and total
    if (data && (data.leads || data.data)) {
      let leadsArr = data.leads || data.data || [];
      // Defensive: if server did not honor statusId filter, filter client-side
      try {
        leadsArr = (leadsArr || []).filter((l: any) => {
          const s = l.statusId || l.status;
          if (s === undefined || s === null || s === "") return false;
          return String(s) === String(statusId);
        });
      } catch (err) {
        // ignore and use original array
      }

      const total =
        typeof data.total === "number" ? data.total : leadsArr.length;

      // fetch users to map assignedTo (so we can filter for SalesTeam on client)
      const usersResp = await fetchUsers();
      const userMap = new Map<string, any>();
      if (usersResp.success && usersResp.data) {
        usersResp.data.forEach((u: any) => userMap.set(String(u.id), u));
      }

      // fetch comments and map by leadId so we can attach comments to each lead
      const commentsResp = await fetchComments();
      const commentsByLead = new Map<string, Comment[]>();
      if (commentsResp.success && commentsResp.data) {
        (commentsResp.data as any[]).forEach((c: any) => {
          const leadId = String(c.leadId || "");
          const commentObj: Comment = {
            id: String(c.id || ""),
            text: c.text || "",
            userId: String(c.userId || ""),
            userName: c.userName || "",
            createdAt: c.createdAt || "",
          };
          const arr = commentsByLead.get(leadId) || [];
          arr.push(commentObj);
          commentsByLead.set(leadId, arr);
        });
      }

      const mapped: Lead[] = (leadsArr || []).map((l: any) => ({
        id: String(l.id || ""),
        name: l.name || l.full_name || "",
        email: l.email || "",
        phone: l.phone || l.phone_number || "",
        venture: l.venture || "",
        source: l.source || "",
        status: (l.status || l.statusId) as any,
        statusId: String(l.statusId || l.status || ""),
        assignedTo:
          userMap.get(String(l.assignedUserId || l.assignedTo || "")) || null,
        comments: commentsByLead.get(String(l.id || "")) || [],
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

      // If a salesUserId is provided, filter to only leads assigned to that user
      let finalLeads = mapped;
      if (salesUserId) {
        finalLeads = mapped.filter(
          (m) => m.assignedTo && String(m.assignedTo.id) === String(salesUserId)
        );
      }

      return { success: true, data: { leads: finalLeads, total } };
    }

    return { success: false, error: "Invalid response format" };
  } catch (error: any) {
    console.error("fetchLeadsByStatus error:", error);
    return {
      success: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch leads",
    };
  }
};

// ============================================
// MUTATION ENDPOINTS
// ============================================

export const updateLeadStatus = async (
  leadId: string,
  statusId: string
): Promise<ApiResponse<any>> => {
  try {
    const res = await postAction("leads.updateStatus", { leadId, statusId });
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
): Promise<ApiResponse<Comment>> => {
  try {
    const res = await postAction("leads.addComment", { leadId, text });
    return normalizeResponse<Comment>(res);
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

export const importLeads = async (
  leadsArray: Partial<Lead>[]
): Promise<ApiResponse<ImportSummary>> => {
  try {
    const res = await postAction("leads.import", { leads: leadsArray });
    return normalizeResponse<ImportSummary>(res);
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

export const assignLead = async (
  leadId: string,
  userId: string
): Promise<ApiResponse<any>> => {
  try {
    const res = await postAction("leads.assign", { leadId, userId });
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

// ============================================
// AUTHENTICATION
// ============================================

export const login = async (
  username: string,
  password: string
): Promise<ApiResponse<{ token: string; user: any }>> => {
  try {
    const res = await postAction("auth.login", { username, password });
    const payload = res?.data;

    if (!payload || !payload.success) {
      return {
        success: false,
        error: payload?.error || "Invalid credentials",
      };
    }

    const result = payload.data;

    if (result && result.token) {
      const userObj = { ...result.user, token: result.token };
      localStorage.setItem("user", JSON.stringify(userObj));

      return {
        success: true,
        data: { token: result.token, user: result.user },
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
  window.location.href = "/";
};

// ============================================
// TEST ENDPOINT
// ============================================

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

// Fetch comments for a single lead (backend should support ?path=comments&leadId=...)
export const fetchCommentsByLead = async (
  leadId: string
): Promise<ApiResponse<Comment[]>> => {
  try {
    const url = `${API_BASE_URL}?path=comments&leadId=${encodeURIComponent(
      String(leadId)
    )}`;
    const response = await axios.get(url);
    return normalizeResponse<Comment[]>(response);
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
