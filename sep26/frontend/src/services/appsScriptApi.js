import * as localMockApi from "./localMockApi.js";
import { getAuthToken } from "./authSession.js";

const REQUEST_TIMEOUT_MS = 15000;

export function assertJsonSerializable(payload, seen = new WeakSet()) {
  if (payload === null || payload === undefined) return true;
  const type = typeof payload;
  if (type === "number" || type === "string" || type === "boolean") return true;
  if (type === "function" || type === "symbol" || type === "bigint") {
    throw new Error(`Non-serializable type encountered: ${type}`);
  }
  if (type === "object") {
    if (typeof window !== "undefined" && payload === window) {
      throw new Error("Window object is not serializable");
    }
    if (typeof document !== "undefined" && payload === document) {
      throw new Error("Document object is not serializable");
    }
    if (typeof Event !== "undefined" && payload instanceof Event) {
      throw new Error("Event object is not serializable");
    }
    if (typeof Node !== "undefined" && payload instanceof Node) {
      throw new Error("DOM Node object is not serializable");
    }
    const constructorName = payload?.constructor?.name || "";
    if (
      ["Window", "HTMLDocument", "Document", "MouseEvent", "PointerEvent", "KeyboardEvent", "Event", "SyntheticBaseEvent"].includes(constructorName) ||
      payload?.window?.window === payload
    ) {
      throw new Error(`Browser object '${constructorName}' is not serializable`);
    }
    if (seen.has(payload)) {
      throw new Error("Circular structure detected in payload");
    }
    seen.add(payload);
    if (Array.isArray(payload)) {
      for (const item of payload) {
        assertJsonSerializable(item, seen);
      }
    } else {
      for (const key of Object.keys(payload)) {
        assertJsonSerializable(payload[key], seen);
      }
    }
    seen.delete(payload);
    return true;
  }
  return true;
}

export function resolveIdToken(idTokenInput) {
  if (typeof idTokenInput === "string" && idTokenInput.trim().length > 0) {
    return idTokenInput.trim();
  }
  const sessionToken = getAuthToken();
  if (typeof sessionToken === "string" && sessionToken.trim().length > 0) {
    return sessionToken.trim();
  }
  return null;
}

async function executePost(endpoint, action, idToken, data) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        idToken,
        data
      }),
      signal: controller ? controller.signal : undefined
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      let parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        // Ignored
      }
      return {
        success: false,
        code: parsed.code || "HTTP_ERROR",
        error: parsed.error || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status
      };
    }

    return await response.json();
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return {
        success: false,
        code: "TIMEOUT_ERROR",
        error: "Service is taking longer than expected. Please check your connection and retry."
      };
    }
    return {
      success: false,
      code: "NETWORK_ERROR",
      error: error.message || "Failed to communicate with API proxy."
    };
  }
}

async function postToProxy(endpoint, action, idTokenInput, data) {
  const resolvedToken = resolveIdToken(idTokenInput);

  const payload = {
    action,
    idToken: resolvedToken,
    data
  };

  try {
    assertJsonSerializable(payload);
  } catch (err) {
    console.error(`[API_MALFORMED_PAYLOAD_PREVENTED] Action ${action} rejected:`, err.message);
    return {
      success: false,
      code: "MALFORMED_PAYLOAD",
      error: `Payload serialization error: ${err.message}`
    };
  }

  if (!resolvedToken) {
    return {
      success: false,
      code: "AUTH_REQUIRED",
      error: "Authentication token is missing or invalid."
    };
  }

  if (import.meta.env.VITE_USE_MOCK === "true") {
    const mockFunctionName = {
      REGISTER_TEAM: "apiRegisterTeam",
      GET_TEAM: "apiGetTeam",
      GET_DOMAINS: "apiGetDomains",
      SELECT_DOMAIN: "apiSelectDomain",
      GET_PROBLEMS: "apiGetProblems",
      SELECT_PROBLEM: "apiSelectProblem",
      LOCK_PROBLEM: "apiLockProblem",
      GET_MY_SELECTION: "apiGetMySelection",
      ADMIN_GET_ALL_DATA: "apiAdminGetAllData",
      ADMIN_GET_STATS: "apiAdminGetStats",
      GET_ADMIN_STATISTICS: "apiAdminGetStats",
      ADMIN_GET_CONFIG: "apiAdminGetConfiguration",
      ADMIN_UPDATE_CONFIG: "apiAdminUpdateConfiguration",
      ADMIN_GET_TEAMS: "apiAdminGetTeams",
      ADMIN_ADD_TEAM: "apiAdminAddTeam",
      ADMIN_UPDATE_TEAM: "apiAdminUpdateTeam",
      ADMIN_GET_PROBLEMS: "apiAdminGetProblems",
      ADMIN_ADD_PROBLEM: "apiAdminAddProblem",
      ADMIN_UPDATE_PROBLEM: "apiAdminUpdateProblem",
      ADMIN_DISABLE_PROBLEM: "apiAdminDisableProblem",
      ADMIN_GET_DOMAINS: "apiAdminGetDomains",
      ADMIN_UPDATE_DOMAIN: "apiAdminUpdateDomain",
      ADMIN_RELEASE_NOW: "apiAdminReleaseNow",
      ADMIN_CLOSE_SELECTION: "apiAdminCloseSelection",
      ADMIN_OPEN_SELECTION: "apiAdminOpenSelection",
      ADMIN_ENABLE_TEAM: "apiAdminEnableTeam",
      ADMIN_DISABLE_TEAM: "apiAdminDisableTeam",
      ADMIN_ENABLE_PROBLEM: "apiAdminEnableProblem",
      ADMIN_REMOVE_TEAM_SELECTION: "apiAdminRemoveTeamSelection",
      ADMIN_REMOVE_ALL_SELECTIONS: "apiAdminRemoveAllSelections",
      ADMIN_SET_ALLOW_RESET: "apiAdminSetAllowReset",
      ADMIN_GET_SELECTIONS: "apiAdminGetSelections",
      SUBMIT_FEEDBACK: "apiSubmitFeedback",
      GET_MY_FEEDBACK_STATUS: "apiGetMyFeedbackStatus",
      ADMIN_GET_FEEDBACK: "apiAdminGetFeedback",
      SUBMIT_FINAL_SUBMISSION: "apiSubmitFinalSubmission",
      GET_MY_FINAL_SUBMISSION_STATUS: "apiGetMyFinalSubmissionStatus",
      ADMIN_GET_FINAL_SUBMISSIONS: "apiAdminGetFinalSubmissions"
    }[action] || action;
    if (typeof localMockApi[mockFunctionName] === "function") {
      return localMockApi[mockFunctionName](resolvedToken, data);
    }
  }

  let result = await executePost(endpoint, action, resolvedToken, data);

  const isTransientFailure = !result.success && (
    result.code === "INVALID_APPS_SCRIPT_RESPONSE" ||
    result.code === "NETWORK_ERROR" ||
    result.status === 502 || result.status === 503 || result.status === 504
  );

  if (isTransientFailure) {
    console.warn(`[API_TRANSIENT_RETRY] Action ${action} failed with ${result.code || result.status}. Retrying in 500ms...`, {
      action,
      endpoint,
      hasToken: Boolean(resolvedToken),
      result
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    result = await executePost(endpoint, action, resolvedToken, data);
  }

  return result;
}

export function apiRegisterTeam(idToken, data) {
  return postToProxy("/api/proxy", "REGISTER_TEAM", idToken, data);
}

export function apiGetTeam(idToken) {
  return postToProxy("/api/proxy", "GET_TEAM", idToken);
}

export function apiGetDomains(idToken) {
  return postToProxy("/api/proxy", "GET_DOMAINS", idToken);
}

export function apiSelectDomain(idToken, dataOrDomainId) {
  return postToProxy(
    "/api/proxy",
    "SELECT_DOMAIN",
    idToken,
    typeof dataOrDomainId === "object" ? dataOrDomainId : { domainId: dataOrDomainId }
  );
}

export function apiGetProblems(idToken, data) {
  return postToProxy("/api/proxy", "GET_PROBLEMS", idToken, data);
}

export function apiSelectProblem(idToken, data) {
  return postToProxy("/api/proxy", "SELECT_PROBLEM", idToken, data);
}

export function apiLockProblem(idToken, psid) {
  return postToProxy("/api/proxy", "LOCK_PROBLEM", idToken, { psid });
}

export function apiGetMySelection(idToken) {
  return postToProxy("/api/proxy", "GET_MY_SELECTION", idToken);
}

export function apiSubmitFeedback(idToken, data) {
  return postToProxy("/api/proxy", "SUBMIT_FEEDBACK", idToken, data);
}

export function apiGetMyFeedbackStatus(idToken) {
  return postToProxy("/api/proxy", "GET_MY_FEEDBACK_STATUS", idToken);
}

export function apiAdminGetFeedback(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_FEEDBACK", idToken);
}

export function apiAdminGetAllData(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_ALL_DATA", idToken);
}

export function apiAdminGetStats(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_STATS", idToken);
}

export function apiAdminGetConfiguration(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_CONFIG", idToken);
}

export function apiAdminUpdateConfiguration(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_UPDATE_CONFIG", idToken, data);
}

export function apiAdminGetTeams(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_GET_TEAMS", idToken, data);
}

export function apiAdminAddTeam(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_ADD_TEAM", idToken, data);
}

export function apiAdminUpdateTeam(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_UPDATE_TEAM", idToken, data);
}

export function apiAdminEnableTeam(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_ENABLE_TEAM", idToken, data);
}

export function apiAdminDisableTeam(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_DISABLE_TEAM", idToken, data);
}

export function apiAdminGetProblems(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_PROBLEMS", idToken);
}

export function apiAdminAddProblem(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_ADD_PROBLEM", idToken, data);
}

export function apiAdminUpdateProblem(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_UPDATE_PROBLEM", idToken, data);
}

export function apiAdminEnableProblem(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_ENABLE_PROBLEM", idToken, data);
}

export function apiAdminDisableProblem(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_DISABLE_PROBLEM", idToken, data);
}

export function apiAdminGetDomains(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_DOMAINS", idToken);
}

export function apiAdminUpdateDomain(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_UPDATE_DOMAIN", idToken, data);
}

export function apiAdminReleaseNow(idToken) {
  return postToProxy("/api/proxy", "ADMIN_RELEASE_NOW", idToken);
}

export function apiAdminCloseSelection(idToken) {
  return postToProxy("/api/proxy", "ADMIN_CLOSE_SELECTION", idToken);
}

export function apiAdminOpenSelection(idToken) {
  return postToProxy("/api/proxy", "ADMIN_OPEN_SELECTION", idToken);
}

export function apiAdminRemoveTeamSelection(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_REMOVE_TEAM_SELECTION", idToken, data);
}

export function apiAdminRemoveSelectionByPsid(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_REMOVE_SELECTION_BY_PSID", idToken, data);
}

export function apiAdminRemoveAllSelections(idToken) {
  return postToProxy("/api/proxy", "ADMIN_REMOVE_ALL_SELECTIONS", idToken);
}

export function apiAdminSetAllowReset(idToken, data) {
  return postToProxy("/api/proxy", "ADMIN_SET_ALLOW_RESET", idToken, data);
}

export function apiAdminGetSelections(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_SELECTIONS", idToken);
}

export function apiSubmitFinalSubmission(idToken, data) {
  return postToProxy("/api/proxy", "SUBMIT_FINAL_SUBMISSION", idToken, data);
}

export function apiGetMyFinalSubmissionStatus(idToken) {
  return postToProxy("/api/proxy", "GET_MY_FINAL_SUBMISSION_STATUS", idToken);
}

export function apiAdminGetFinalSubmissions(idToken) {
  return postToProxy("/api/proxy", "ADMIN_GET_FINAL_SUBMISSIONS", idToken);
}
