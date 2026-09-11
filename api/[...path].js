const ACTION_MAP = {
  "/register-team": "REGISTER_TEAM",
  "/domains": "GET_DOMAINS",
  "/get-domains": "GET_DOMAINS",
  "/select-domain": "SELECT_DOMAIN",
  "/problems": "GET_PROBLEMS",
  "/get-problems": "GET_PROBLEMS",
  "/select-problem": "SELECT_PROBLEM",
  "/my-selection": "GET_MY_SELECTION",
  "/get-my-selection": "GET_MY_SELECTION",
  "/admin/stats": "ADMIN_GET_STATS",
  "/admin/teams": "ADMIN_GET_TEAMS",
  "/admin/add-team": "ADMIN_ADD_TEAM",
  "/admin/update-team": "ADMIN_UPDATE_TEAM",
  "/admin/enable-team": "ADMIN_ENABLE_TEAM",
  "/admin/disable-team": "ADMIN_DISABLE_TEAM",
  "/admin/problems": "ADMIN_GET_PROBLEMS",
  "/admin/add-problem": "ADMIN_ADD_PROBLEM",
  "/admin/update-problem": "ADMIN_UPDATE_PROBLEM",
  "/admin/enable-problem": "ADMIN_ENABLE_PROBLEM",
  "/admin/disable-problem": "ADMIN_DISABLE_PROBLEM",
  "/admin/domains": "ADMIN_GET_DOMAINS",
  "/admin/update-domain": "ADMIN_UPDATE_DOMAIN",
  "/admin/release-now": "ADMIN_RELEASE_NOW",
  "/admin/close-selection": "ADMIN_CLOSE_SELECTION",
  "/admin/open-selection": "ADMIN_OPEN_SELECTION"
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Only GET and POST requests are supported."
    });
  }

  try {
    let payload = req.body || {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return res.status(400).json({
          success: false,
          code: "INVALID_JSON",
          error: "Request body must be valid JSON."
        });
      }
    }

    const pathSegments = req.query && req.query.path;
    const subPath = "/" + (Array.isArray(pathSegments) ? pathSegments.join("/") : (pathSegments || ""));

    if (!payload.action && ACTION_MAP[subPath]) {
      payload.action = ACTION_MAP[subPath];
    }

    const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

    if (!appsScriptUrl) {
      return res.status(500).json({
        success: false,
        code: "MISSING_BACKEND_URL",
        error: "APPS_SCRIPT_WEB_APP_URL environment variable is not configured."
      });
    }

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const responseText = await response.text();
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(responseText);
    } catch {
      jsonResponse = {
        success: false,
        code: "INVALID_APPS_SCRIPT_RESPONSE",
        error: "Apps Script Web App returned non-JSON output."
      };
    }

    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: "PROXY_ERROR",
      error: error.message || "Vercel API proxy error."
    });
  }
}
