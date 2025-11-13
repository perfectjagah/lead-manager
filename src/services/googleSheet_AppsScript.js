/**
 * Lead Manager Apps Script API
 *
 * GET requests with ?path=leads|statuses|users
 * POST requests with action in body
 *
 * Deploy: Web App -> Execute as: Me, Who has access: Anyone
 */

const SPREADSHEET_ID = "1WhTYO_rILZk02DjByaz0paNawfwZWrAthZy0rjQOWAI"; // ⚠️ REPLACE THIS!

// ========== UTILITIES ==========

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheetRows(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (!rows || rows.length === 0) return [];

  const headers = rows.shift().map((h) => String(h).trim());
  return rows.map((r) => {
    const obj = {};
    r.forEach((cell, i) => (obj[headers[i]] = cell));
    return obj;
  });
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

// ========== HANDLERS ==========

function handleFetchLeads() {
  const leads = sheetRows("leads").map((l) => ({
    id: String(l.id || ""),
    name: l.name || "",
    email: l.email || "",
    phone: l.phone || "",
    venture: l.venture || "",
    source: l.source || "",
    statusId: String(l.statusId || ""),
    assignedUserId: String(l.assignedUserId || ""),
    createdAt: l.createdAt || "",
    updatedAt: l.updatedAt || "",
  }));
  return { success: true, data: leads };
}

function handleFetchStatuses() {
  const statuses = sheetRows("statuses").map((s) => ({
    id: String(s.id || ""),
    name: s.name || "",
    color: s.color || "",
    order: Number(s.order || 0),
  }));
  statuses.sort((a, b) => a.order - b.order);
  return { success: true, data: statuses };
}

function handleFetchUsers() {
  const users = sheetRows("users").map((u) => ({
    id: String(u.id || ""),
    username: u.username || "",
    role: u.role || "",
    name: u.name || "",
    email: u.email || "",
  }));
  return { success: true, data: users };
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

function handleFetchComments(params) {
  try {
    const leadId = params.leadId;

    if (!leadId) {
      return { success: false, error: "Missing leadId parameter" };
    }

    // Get all comments
    const allComments = sheetRows("comments");

    // Filter by leadId
    const leadComments = allComments.filter(
      (c) => String(c.leadId || "") === String(leadId)
    );

    // Get users to map userId to userName
    const users = sheetRows("users");
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

    // Sort by createdAt (newest first)
    normalized.sort((a, b) => {
      try {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      } catch {
        return 0;
      }
    });

    return { success: true, data: normalized };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function handleAddComment(body, currentUser) {
  if (!currentUser) return { success: false, error: "Unauthorized" };

  const leadId = body.leadId;
  const text = body.text;

  if (!leadId || !text)
    return { success: false, error: "Missing leadId or text" };

  const id = uuid();
  const now = new Date().toISOString();

  getSpreadsheet()
    .getSheetByName("comments")
    .appendRow([id, leadId, currentUser.id, text, now]);

  return {
    success: true,
    data: {
      id: id,
      leadId: leadId,
      userId: currentUser.id,
      text: text,
      createdAt: now,
    },
  };
}

// Paste into your Apps Script project. Assumes you have a sheet named "leads".
// Call from your doPost router when action === 'leads.import'

function handleImportLeads(e) {
  try {
    // Helper: robustly get the 'leads' payload whether form-encoded or raw JSON body
    const rawLeadsValue = (() => {
      if (e.parameter && e.parameter.leads) {
        // typical form-encoded: leads=<JSON string>
        return e.parameter.leads;
      }
      if (e.postData && e.postData.contents) {
        // Could be JSON body like { action: 'leads.import', leads: [...] }
        try {
          const parsed = JSON.parse(e.postData.contents);
          if (parsed && parsed.leads) return parsed.leads;
        } catch (err) {
          // Not JSON - could be form-encoded string
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

    // rawLeadsValue may be an object or a JSON string
    let leadsArray;
    if (typeof rawLeadsValue === "string") {
      try {
        leadsArray = JSON.parse(rawLeadsValue);
      } catch (err) {
        // sometimes leads param is a single object string or form-encoded - try parse fallback
        try {
          leadsArray = JSON.parse(decodeURIComponent(rawLeadsValue));
        } catch (err2) {
          // last resort: wrap single row into array
          leadsArray = [rawLeadsValue];
        }
      }
    } else {
      leadsArray = rawLeadsValue;
    }

    if (!Array.isArray(leadsArray)) {
      // if single object provided
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

    // Read current headers
    const lastCol = Math.max(1, sheet.getLastColumn());
    let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

    // Ensure core headers exist
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

    // Re-read headers after potential changes
    const finalLastCol = sheet.getLastColumn();
    headers = sheet.getRange(1, 1, 1, finalLastCol).getValues()[0].map(String);

    // For each lead, ensure extraFields keys become headers, then build row aligned to headers
    const rowsToAppend = [];
    leadsArray.forEach((lead) => {
      // Normalize lead keys (support both camelCase and snake_case)
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

      // extraFields may be object or JSON string
      let extra = lead.extraFields || lead.extra_fields || lead.extra || null;
      if (typeof extra === "string") {
        try {
          extra = JSON.parse(extra);
        } catch (err) {
          // if it's a simple string, map to one key
          extra = { misc: String(extra) };
        }
      }
      if (!extra || typeof extra !== "object") extra = {};

      // Ensure header exists for each extra field key
      Object.keys(extra).forEach((k) => {
        ensureHeaderIndex(k);
      });

      // Ensure extraFields header exists and store JSON string too
      ensureHeaderIndex("extraFields");
      rowObj["extraFields"] = Object.keys(extra).length
        ? JSON.stringify(extra)
        : "";

      // Build a values array aligned with headers
      const valuesRow = headers.map((h) => {
        if (rowObj[h] !== undefined) return rowObj[h];
        // if it's one of the dynamic extra keys
        if (extra && extra[h] !== undefined) return extra[h];
        return "";
      });

      rowsToAppend.push(valuesRow);
    });

    if (rowsToAppend.length > 0) {
      // Append in a single operation
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          rowsToAppend.length,
          headers.length
        )
        .setValues(rowsToAppend);
    }

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

// Helper to parse form-url-encoded body into an object
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

function handleUpdateStatus(body, currentUser) {
  // if (!currentUser) return { success: false, error: 'Unauthorized' };

  const leadId = body.leadId;
  const statusId = body.statusId;

  if (!leadId || !statusId)
    return { success: false, error: "Missing leadId or statusId" };

  const rowIndex = findRowIndexById("leads", leadId);
  if (rowIndex < 0) return { success: false, error: "Lead not found" };

  const sheet = getSpreadsheet().getSheetByName("leads");
  sheet.getRange(rowIndex, 7).setValue(statusId);
  sheet.getRange(rowIndex, 10).setValue(new Date().toISOString());

  return { success: true, data: { leadId: leadId, statusId: statusId } };
}

function handleAssignLead(body, currentUser) {
  if (!currentUser || currentUser.role !== "Admin") {
    return { success: false, error: "Unauthorized" };
  }

  const leadId = body.leadId;
  const userId = body.userId;

  if (!leadId || !userId)
    return { success: false, error: "Missing leadId or userId" };

  const rowIndex = findRowIndexById("leads", leadId);
  if (rowIndex < 0) return { success: false, error: "Lead not found" };

  const sheet = getSpreadsheet().getSheetByName("leads");
  sheet.getRange(rowIndex, 8).setValue(userId);
  sheet.getRange(rowIndex, 10).setValue(new Date().toISOString());

  return { success: true, data: { leadId: leadId, userId: userId } };
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
      message: "Lead Manager API v1.0",
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
// Call when GET / ? path=leads & statusId=... & limit=5000 & offset=0
function handleFetchLeadsPaged(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("leads");
    if (!sheet)
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: "Missing leads sheet" })
      ).setMimeType(ContentService.MimeType.JSON);

    const params = e.parameter || {};
    const statusId = params.statusId;
    const limit = parseInt(params.limit, 10) || 5000;
    const offset = parseInt(params.offset, 10) || 0;

    const lastRow = Math.max(1, sheet.getLastRow());
    const lastCol = Math.max(1, sheet.getLastColumn());
    const rows = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = rows[0].map(String);

    const dataRows = rows.slice(1);
    const objs = dataRows.map((r) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r[i]));
      return obj;
    });

    const filtered = statusId
      ? objs.filter(
          (o) => String(o.statusId || o.status_id || "") === String(statusId)
        )
      : objs;
    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    const normalized = page.map((row) => {
      const copy = { ...row };
      if (copy.extraFields && typeof copy.extraFields === "string") {
        try {
          copy.extraFields = JSON.parse(copy.extraFields);
        } catch (err) {
          /* leave as-is */
        }
      }
      return copy;
    });

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, data: { leads: normalized, total } })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
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

    // Parse form-encoded or JSON body
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        body = e.parameter || {};
      }
    } else {
      body = e.parameter || {};
    }

    // Handle stringified arrays
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
