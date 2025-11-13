/**
 * Lead Manager Apps Script API - OPTIMIZED
 *
 * Performance improvements:
 * - Script-level caching (60s TTL)
 * - Batch data loading
 * - Reduced API calls
 * - Optimized pagination
 *
 * Deploy: Web App -> Execute as: Me, Who has access: Anyone
 */

const SPREADSHEET_ID = "1WhTYO_rILZk02DjByaz0paNawfwZWrAthZy0rjQOWAI";
const CACHE_DURATION = 60; // seconds

// ========== CACHING ==========

function getCacheKey(key, params = {}) {
  const paramStr = JSON.stringify(params);
  const hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    paramStr,
    Utilities.Charset.UTF_8
  )
    .map((byte) => ("0" + (byte & 0xff).toString(16)).slice(-2))
    .join("");
  return `${key}_${hash}`;
}

function getFromCache(key) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    Logger.log("Cache get error: " + err);
  }
  return null;
}

function setToCache(key, data, ttl = CACHE_DURATION) {
  try {
    const cache = CacheService.getScriptCache();
    cache.put(key, JSON.stringify(data), ttl);
  } catch (err) {
    Logger.log("Cache set error: " + err);
  }
}

function clearCacheByPattern(pattern) {
  // Note: Apps Script cache doesn't support pattern clearing
  // We'll rely on TTL expiration
  Logger.log("Cache cleared for pattern: " + pattern);
}

// ========== UTILITIES ==========

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheetRows(sheetName) {
  const cacheKey = getCacheKey(`sheet_${sheetName}`);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (!rows || rows.length === 0) return [];

  const headers = rows.shift().map((h) => String(h).trim());
  const result = rows.map((r) => {
    const obj = {};
    r.forEach((cell, i) => (obj[headers[i]] = cell));
    return obj;
  });

  setToCache(cacheKey, result, 60);
  return result;
}

function findRowIndexById(sheetName, id) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return -1;

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function writeJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function uuid() {
  return Utilities.getUuid();
}

function getUserByToken(token) {
  if (!token) return null;
  const users = sheetRows("users") || [];
  return users.find((u) => String(u.token) === String(token)) || null;
}

// ========== OPTIMIZED HANDLERS ==========

function handleFetchStatuses() {
  const cacheKey = "statuses";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const statuses = sheetRows("statuses").map((s) => ({
    id: String(s.id || ""),
    name: s.name || "",
    color: s.color || "",
    order: Number(s.order || 0),
  }));
  statuses.sort((a, b) => a.order - b.order);

  const result = { success: true, data: statuses };
  setToCache(cacheKey, result, 300); // Cache for 5 minutes
  return result;
}

function handleFetchUsers() {
  const cacheKey = "users";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const users = sheetRows("users").map((u) => ({
    id: String(u.id || ""),
    username: u.username || "",
    role: u.role || "",
    name: u.name || "",
    email: u.email || "",
  }));

  const result = { success: true, data: users };
  setToCache(cacheKey, result, 300); // Cache for 5 minutes
  return result;
}

function handleFetchLeadsPaged(e) {
  try {
    const params = e.parameter || {};
    const statusId = params.statusId;
    const limit = Math.min(parseInt(params.limit, 10) || 50, 100); // Max 100
    const offset = parseInt(params.offset, 10) || 0;

    // Create cache key
    const cacheKey = getCacheKey("leads_paged", { statusId, limit, offset });
    const cached = getFromCache(cacheKey);
    if (cached) {
      return writeJson(cached);
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("leads");
    if (!sheet) {
      return writeJson({ success: false, error: "Missing leads sheet" });
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) {
      const emptyResult = { success: true, data: { leads: [], total: 0 } };
      setToCache(cacheKey, emptyResult, 60);
      return writeJson(emptyResult);
    }

    // Get ALL data in ONE batch call
    const rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = rows[0].map(String);
    const dataRows = rows.slice(1);

    // Build objects efficiently
    const objs = dataRows.map((r) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r[i]));
      return obj;
    });

    // Filter by statusId if provided
    const filtered = statusId
      ? objs.filter((o) => String(o.statusId || "") === String(statusId))
      : objs;

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    // Minimal normalization
    const normalized = page.map((row) => ({
      id: String(row.id || ""),
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
      venture: row.venture || "",
      source: row.source || "",
      statusId: String(row.statusId || ""),
      assignedUserId: String(row.assignedUserId || ""),
      createdAt: row.createdAt || "",
      updatedAt: row.updatedAt || "",
      adName: row.adName || "",
      adsetName: row.adsetName || "",
      formName: row.formName || "",
      extraFields: row.extraFields || "",
    }));

    // Parse extraFields if string
    normalized.forEach((lead) => {
      if (lead.extraFields && typeof lead.extraFields === "string") {
        try {
          lead.extraFields = JSON.parse(lead.extraFields);
        } catch (err) {
          lead.extraFields = {};
        }
      }
    });

    const result = {
      success: true,
      data: { leads: normalized, total },
    };

    // Cache result
    setToCache(cacheKey, result, 60);

    return writeJson(result);
  } catch (err) {
    Logger.log("Error in handleFetchLeadsPaged: " + err);
    return writeJson({ success: false, error: String(err) });
  }
}

function handleFetchComments(params) {
  try {
    const leadId = params.leadId;

    if (!leadId) {
      return { success: false, error: "Missing leadId parameter" };
    }

    const cacheKey = getCacheKey("comments", { leadId });
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    // Get comments for this lead only
    const allComments = sheetRows("comments");
    const leadComments = allComments.filter(
      (c) => String(c.leadId || "") === String(leadId)
    );

    // Get users map (cached)
    const usersResult = handleFetchUsers();
    const users = usersResult.data || [];
    const userMap = {};
    users.forEach((u) => {
      userMap[String(u.id)] = u.name || u.username || "Unknown User";
    });

    // Map comments with userName
    const normalized = leadComments.map((c) => ({
      id: String(c.id || ""),
      leadId: String(c.leadId || ""),
      userId: String(c.userId || ""),
      userName: userMap[String(c.userId)] || "Unknown User",
      text: c.text || "",
      createdAt: c.createdAt || "",
    }));

    // Sort by createdAt (oldest first for conversation flow)
    normalized.sort((a, b) => {
      try {
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      } catch {
        return 0;
      }
    });

    const result = { success: true, data: normalized };
    setToCache(cacheKey, result, 30); // Cache for 30 seconds
    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function handleLogin(body) {
  const username = String(body.username || "");
  const password = String(body.password || "");
  const users = sheetRows("users") || [];
  const found = users.find(
    (u) => String(u.username) === username && String(u.password) === password
  );

  if (!found) return { success: false, error: "Invalid credentials" };

  const token = uuid();
  const rowIndex = findRowIndexById("users", found.id);

  if (rowIndex > 0) {
    getSpreadsheet()
      .getSheetByName("users")
      .getRange(rowIndex, 7)
      .setValue(token);
  }

  const user = {
    id: String(found.id),
    username: found.username,
    role: found.role,
    name: found.name,
    email: found.email,
  };

  return { success: true, data: { token: token, user: user } };
}

function handleAddComment(body, currentUser) {
  if (!currentUser) return { success: false, error: "Unauthorized" };

  const leadId = body.leadId;
  const text = body.text;

  if (!leadId || !text) {
    return { success: false, error: "Missing leadId or text" };
  }

  const id = uuid();
  const now = new Date().toISOString();

  getSpreadsheet()
    .getSheetByName("comments")
    .appendRow([id, leadId, currentUser.id, text, now]);

  // Clear comment cache for this lead
  clearCacheByPattern("comments");

  return {
    success: true,
    data: {
      id: id,
      leadId: leadId,
      userId: currentUser.id,
      userName: currentUser.name || currentUser.username,
      text: text,
      createdAt: now,
    },
  };
}

function handleUpdateStatus(body, currentUser) {
  const leadId = body.leadId;
  const statusId = body.statusId;

  if (!leadId || !statusId) {
    return { success: false, error: "Missing leadId or statusId" };
  }

  const rowIndex = findRowIndexById("leads", leadId);
  if (rowIndex < 0) {
    return { success: false, error: "Lead not found" };
  }

  const sheet = getSpreadsheet().getSheetByName("leads");
  sheet.getRange(rowIndex, 7).setValue(statusId);
  sheet.getRange(rowIndex, 10).setValue(new Date().toISOString());

  // Clear leads cache
  clearCacheByPattern("leads");

  return { success: true, data: { leadId: leadId, statusId: statusId } };
}

function handleAssignLead(body, currentUser) {
  if (!currentUser || currentUser.role !== "Admin") {
    return { success: false, error: "Unauthorized" };
  }

  const leadId = body.leadId;
  const userId = body.userId;

  if (!leadId || !userId) {
    return { success: false, error: "Missing leadId or userId" };
  }

  const rowIndex = findRowIndexById("leads", leadId);
  if (rowIndex < 0) {
    return { success: false, error: "Lead not found" };
  }

  const sheet = getSpreadsheet().getSheetByName("leads");
  sheet.getRange(rowIndex, 8).setValue(userId);
  sheet.getRange(rowIndex, 10).setValue(new Date().toISOString());

  // Clear leads cache
  clearCacheByPattern("leads");

  return { success: true, data: { leadId: leadId, userId: userId } };
}

function handleImportLeads(e) {
  try {
    const rawLeadsValue = (() => {
      if (e.parameter && e.parameter.leads) {
        return e.parameter.leads;
      }
      if (e.postData && e.postData.contents) {
        try {
          const parsed = JSON.parse(e.postData.contents);
          if (parsed && parsed.leads) return parsed.leads;
        } catch (err) {
          const parsedForm = parseFormUrlEncoded(e.postData.contents || "");
          if (parsedForm.leads) return parsedForm.leads;
        }
      }
      return null;
    })();

    if (!rawLeadsValue) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "No leads payload" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    let leadsArray;
    if (typeof rawLeadsValue === "string") {
      try {
        leadsArray = JSON.parse(rawLeadsValue);
      } catch (err) {
        try {
          leadsArray = JSON.parse(decodeURIComponent(rawLeadsValue));
        } catch (err2) {
          leadsArray = [rawLeadsValue];
        }
      }
    } else {
      leadsArray = rawLeadsValue;
    }

    if (!Array.isArray(leadsArray)) {
      if (typeof leadsArray === "object") leadsArray = [leadsArray];
      else
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, error: "Invalid leads payload" })
        ).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("leads");
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "Missing 'leads' sheet" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const lastCol = Math.max(1, sheet.getLastColumn());
    let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

    const ensureHeaderIndex = (name) => {
      let idx = headers.indexOf(name);
      if (idx === -1) {
        headers.push(name);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        idx = headers.length - 1;
      }
      return idx;
    };

    const coreHeaders = [
      "id",
      "name",
      "email",
      "phone",
      "venture",
      "source",
      "statusId",
      "assignedUserId",
      "createdAt",
      "updatedAt",
      "adName",
      "adsetName",
      "formName",
      "extraFields",
    ];
    coreHeaders.forEach((h) => ensureHeaderIndex(h));

    const finalLastCol = sheet.getLastColumn();
    headers = sheet.getRange(1, 1, 1, finalLastCol).getValues()[0].map(String);

    const rowsToAppend = [];
    leadsArray.forEach((lead) => {
      const normalize = (obj, keyOptions) => {
        for (const k of keyOptions) {
          if (obj[k] !== undefined) return obj[k];
        }
        return undefined;
      };

      const rowObj = {};
      rowObj["id"] = normalize(lead, ["id", "leadId"]) || "";
      rowObj["name"] = normalize(lead, ["name", "full_name"]) || "";
      rowObj["email"] = normalize(lead, ["email"]) || "";
      rowObj["phone"] = normalize(lead, ["phone", "phone_number"]) || "";
      rowObj["venture"] = normalize(lead, ["venture"]) || "";
      rowObj["source"] = normalize(lead, ["source"]) || "";
      rowObj["statusId"] = normalize(lead, ["statusId", "status_id"]) || "";
      rowObj["assignedUserId"] =
        normalize(lead, ["assignedTo", "assignedUserId", "assigned_user_id"]) ||
        "";
      rowObj["createdAt"] =
        normalize(lead, ["createdAt", "created_time"]) || "";
      rowObj["updatedAt"] = normalize(lead, ["updatedAt"]) || "";
      rowObj["adName"] = normalize(lead, ["adName", "ad_name"]) || "";
      rowObj["adsetName"] = normalize(lead, ["adsetName", "adset_name"]) || "";
      rowObj["formName"] = normalize(lead, ["formName", "form_name"]) || "";

      let extra = lead.extraFields || lead.extra_fields || lead.extra || null;
      if (typeof extra === "string") {
        try {
          extra = JSON.parse(extra);
        } catch (err) {
          extra = { misc: String(extra) };
        }
      }
      if (!extra || typeof extra !== "object") extra = {};

      Object.keys(extra).forEach((k) => {
        ensureHeaderIndex(k);
      });

      ensureHeaderIndex("extraFields");
      rowObj["extraFields"] = Object.keys(extra).length
        ? JSON.stringify(extra)
        : "";

      const valuesRow = headers.map((h) => {
        if (rowObj[h] !== undefined) return rowObj[h];
        if (extra && extra[h] !== undefined) return extra[h];
        return "";
      });

      rowsToAppend.push(valuesRow);
    });

    if (rowsToAppend.length > 0) {
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          rowsToAppend.length,
          headers.length
        )
        .setValues(rowsToAppend);
    }

    // Clear cache after import
    clearCacheByPattern("leads");

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, added: rowsToAppend.length })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const msg = String(err && err.stack ? err.stack : err);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: msg })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseFormUrlEncoded(body) {
  const out = {};
  if (!body) return out;
  const pairs = body.split("&");
  pairs.forEach((p) => {
    const idx = p.indexOf("=");
    if (idx > -1) {
      const k = decodeURIComponent(p.substring(0, idx).replace(/\+/g, " "));
      const v = decodeURIComponent(p.substring(idx + 1).replace(/\+/g, " "));
      out[k] = v;
    } else {
      out[decodeURIComponent(p)] = "";
    }
  });
  return out;
}

// ========== ROUTER ==========

function doGet(e) {
  try {
    const path = e.parameter.path || "";
    const params = e.parameter || {};

    if (path === "leads") return handleFetchLeadsPaged(e);
    if (path === "statuses") return writeJson(handleFetchStatuses());
    if (path === "users") return writeJson(handleFetchUsers());
    if (path === "comments") return writeJson(handleFetchComments(params));

    return writeJson({
      success: true,
      message: "Lead Manager API v2.0 - Optimized",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return writeJson({
      success: false,
      error: String(err),
      stack: err.stack || "",
    });
  }
}

function doPost(e) {
  const action =
    (e.parameter && e.parameter.action) ||
    (e.postData &&
      (() => {
        try {
          return JSON.parse(e.postData.contents).action;
        } catch (e) {
          return null;
        }
      })());

  if (action === "leads.import") {
    return handleImportLeads(e);
  }

  try {
    let body = {};

    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        body = e.parameter || {};
      }
    } else {
      body = e.parameter || {};
    }

    if (body.leads && typeof body.leads === "string") {
      try {
        body.leads = JSON.parse(body.leads);
      } catch (e) {}
    }

    const token = body.token || (e.parameter && e.parameter.token);
    const currentUser = getUserByToken(token);
    const action = (
      body.action ||
      (e.parameter && e.parameter.action) ||
      ""
    ).toString();

    switch (action) {
      case "auth.login":
        return writeJson(handleLogin(body));

      case "leads.fetch":
        return handleFetchLeadsPaged(e);

      case "leads.import":
        return writeJson(handleImportLeads(body));

      case "leads.addComment":
        return writeJson(handleAddComment(body, currentUser));

      case "leads.updateStatus":
        return writeJson(handleUpdateStatus(body, currentUser));

      case "leads.assign":
        return writeJson(handleAssignLead(body, currentUser));

      default:
        return writeJson({
          success: false,
          error: "Unknown action: " + action,
        });
    }
  } catch (err) {
    return writeJson({
      success: false,
      error: String(err),
      stack: err.stack || "",
    });
  }
}
