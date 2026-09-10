const APPS_SCRIPT_WEB_APP_URL =
  process.env.APPS_SCRIPT_WEB_APP_URL || "";

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

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
      }
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        code: "METHOD_NOT_ALLOWED",
        error: "Only POST requests are supported."
      })
    };
  }

  try {
    let payload = {};
    if (event.body) {
      try {
        payload = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({
            success: false,
            code: "INVALID_JSON",
            error: "Request body must be valid JSON."
          })
        };
      }
    }

    let subPath = event.path || "";
    subPath = subPath
      .replace(/^\/\.netlify\/functions\/api-proxy/, "")
      .replace(/^\/api/, "");

    if (!payload.action && ACTION_MAP[subPath]) {
      payload.action = ACTION_MAP[subPath];
    }

    const appsScriptUrl =
      process.env.APPS_SCRIPT_WEB_APP_URL || APPS_SCRIPT_WEB_APP_URL;

    if (!appsScriptUrl) {
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          success: false,
          code: "MISSING_BACKEND_URL",
          error:
            "APPS_SCRIPT_WEB_APP_URL environment variable is not configured."
        })
      };
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

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(jsonResponse)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        code: "PROXY_ERROR",
        error: error.message || "Serverless API proxy error."
      })
    };
  }
};
