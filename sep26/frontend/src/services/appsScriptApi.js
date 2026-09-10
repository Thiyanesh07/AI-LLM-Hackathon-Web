import * as localMockApi from "./localMockApi";

const useLocalMock = import.meta.env.VITE_USE_MOCK === "true";

async function postToProxy(endpoint, action, idToken, data) {
  if (useLocalMock) {
    if (typeof localMockApi[action] === "function") {
      return localMockApi[action](idToken, data);
    }
  }

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
      })
    });

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
        error: parsed.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      code: "NETWORK_ERROR",
      error: error.message || "Failed to communicate with API proxy."
    };
  }
}

export function apiRegisterTeam(idToken, data) {
  return postToProxy("/api/register-team", "REGISTER_TEAM", idToken, data);
}

export function apiGetDomains(idToken) {
  return postToProxy("/api/domains", "GET_DOMAINS", idToken);
}

export function apiSelectDomain(idToken, dataOrDomainId) {
  return postToProxy(
    "/api/select-domain",
    "SELECT_DOMAIN",
    idToken,
    typeof dataOrDomainId === "object" ? dataOrDomainId : { domainId: dataOrDomainId }
  );
}

export function apiGetProblems(idToken, data) {
  return postToProxy("/api/problems", "GET_PROBLEMS", idToken, data);
}

export function apiSelectProblem(idToken, data) {
  return postToProxy("/api/select-problem", "SELECT_PROBLEM", idToken, data);
}

export function apiGetMySelection(idToken) {
  return postToProxy("/api/my-selection", "GET_MY_SELECTION", idToken);
}

export function apiAdminGetStats(idToken) {
  return postToProxy("/api/admin/stats", "ADMIN_GET_STATS", idToken);
}

export function apiAdminGetTeams(idToken, data) {
  return postToProxy("/api/admin/teams", "ADMIN_GET_TEAMS", idToken, data);
}

export function apiAdminAddTeam(idToken, data) {
  return postToProxy("/api/admin/add-team", "ADMIN_ADD_TEAM", idToken, data);
}

export function apiAdminUpdateTeam(idToken, data) {
  return postToProxy("/api/admin/update-team", "ADMIN_UPDATE_TEAM", idToken, data);
}

export function apiAdminEnableTeam(idToken, data) {
  return postToProxy("/api/admin/enable-team", "ADMIN_ENABLE_TEAM", idToken, data);
}

export function apiAdminDisableTeam(idToken, data) {
  return postToProxy("/api/admin/disable-team", "ADMIN_DISABLE_TEAM", idToken, data);
}

export function apiAdminGetProblems(idToken) {
  return postToProxy("/api/admin/problems", "ADMIN_GET_PROBLEMS", idToken);
}

export function apiAdminAddProblem(idToken, data) {
  return postToProxy("/api/admin/add-problem", "ADMIN_ADD_PROBLEM", idToken, data);
}

export function apiAdminUpdateProblem(idToken, data) {
  return postToProxy("/api/admin/update-problem", "ADMIN_UPDATE_PROBLEM", idToken, data);
}

export function apiAdminEnableProblem(idToken, data) {
  return postToProxy("/api/admin/enable-problem", "ADMIN_ENABLE_PROBLEM", idToken, data);
}

export function apiAdminDisableProblem(idToken, data) {
  return postToProxy("/api/admin/disable-problem", "ADMIN_DISABLE_PROBLEM", idToken, data);
}

export function apiAdminGetDomains(idToken) {
  return postToProxy("/api/admin/domains", "ADMIN_GET_DOMAINS", idToken);
}

export function apiAdminUpdateDomain(idToken, data) {
  return postToProxy("/api/admin/update-domain", "ADMIN_UPDATE_DOMAIN", idToken, data);
}

export function apiAdminReleaseNow(idToken) {
  return postToProxy("/api/admin/release-now", "ADMIN_RELEASE_NOW", idToken);
}

export function apiAdminCloseSelection(idToken) {
  return postToProxy("/api/admin/close-selection", "ADMIN_CLOSE_SELECTION", idToken);
}

export function apiAdminOpenSelection(idToken) {
  return postToProxy("/api/admin/open-selection", "ADMIN_OPEN_SELECTION", idToken);
}
