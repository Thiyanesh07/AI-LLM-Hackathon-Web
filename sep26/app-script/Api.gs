function apiRegisterTeam(idToken, data) {
  return apiCall_(function() {
    requireAuthenticatedUser(idToken);
    return registerTeam(idToken, data);
  });
}


function apiGetTeam(idToken) {
  return apiCall_(function() {
    const user = requireAuthenticatedUser(idToken);
    const team = getTeamByLeaderEmail(user.email);

    if (!team) {
      throwApiError(
        "No registered team was found for this college account.",
        "TEAM_NOT_REGISTERED"
      );
    }

    if (String(team.Status).trim() !== TEAM_STATUS.ACTIVE) {
      throwApiError("This team is disabled.", "TEAM_DISABLED");
    }

    return getParticipantTeamSnapshot(team);
  });
}


function apiGetDomains(idToken) {
  return apiCall_(function() {
    if (idToken) {
      requireTeamLeader(idToken);
    }
    return getParticipantDomains(idToken);
  });
}


function apiSelectDomain(idToken, dataOrDomainId) {
  return apiCall_(function() {
    requireTeamLeader(idToken);
    return selectDomain(idToken, dataOrDomainId);
  });
}


function apiGetProblems(idToken, data) {
  return apiCall_(function() {
    requireTeamLeader(idToken);
    return getParticipantProblems(idToken, data);
  });
}


function apiSelectProblem(idToken, data) {
  return apiCall_(function() {
    return lockProblem(idToken, data);
  });
}


function apiLockProblem(idToken, data) {
  return apiCall_(function() {
    return lockProblem(idToken, data);
  });
}


function apiGetMySelection(idToken) {
  return apiCall_(function() {
    requireTeamLeader(idToken);
    return getMySelection(idToken);
  });
}


function apiAdminGetStats(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminDashboardStats();
  });
}


function apiAdminGetTeams(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminTeams(data);
  });
}


function apiAdminAddTeam(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminCreateTeamDirect(data);
  });
}


function apiAdminUpdateTeam(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminUpdateTeam(data);
  });
}


function apiAdminEnableTeam(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminEnableTeam(getRequestedTeamId(data));
  });
}


function apiAdminDisableTeam(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminDisableTeam(getRequestedTeamId(data));
  });
}


function apiAdminGetProblems(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminProblems();
  });
}


function apiAdminAddProblem(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminAddProblem(data);
  });
}


function apiAdminUpdateProblem(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminUpdateProblem(data);
  });
}


function apiAdminEnableProblem(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminEnableProblem(getRequestedProblemId(data));
  });
}


function apiAdminDisableProblem(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminDisableProblem(getRequestedProblemId(data));
  });
}


function apiAdminGetDomains(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminDomains();
  });
}


function apiAdminUpdateDomain(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminUpdateDomain(data);
  });
}


function apiAdminReleaseNow(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminReleaseNow();
  });
}


function apiAdminCloseSelection(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminSetSelectionStatus(SELECTION_STATUS.CLOSED);
  });
}


function apiAdminOpenSelection(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminSetSelectionStatus(SELECTION_STATUS.OPEN);
  });
}


function apiCall_(operation) {
  try {
    const result = operation();
    const serializedResult = serializeApiValue_(result);

    if (serializedResult && serializedResult.success !== undefined &&
        serializedResult.data !== undefined) {
      return serializedResult;
    }

    return {
      success: true,
      data: serializedResult
    };
  } catch (error) {
    return {
      success: false,
      code: error && error.code || "INTERNAL_ERROR",
      error: error && error.message || "Unexpected error."
    };
  }
}


function serializeApiValue_(value) {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeApiValue_);
  }

  if (value && typeof value === "object") {
    const result = {};

    Object.keys(value).forEach(function(key) {
      result[key] = serializeApiValue_(value[key]);
    });

    return result;
  }

  return value === undefined ? null : value;
}


function apiAdminGetConfiguration(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminConfiguration();
  });
}


function apiAdminUpdateConfiguration(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminUpdateConfiguration(data);
  });
}


function apiAdminRemoveTeamSelection(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminRemoveTeamSelection(getRequestedTeamId(data));
  });
}


function apiAdminRemoveSelectionByPsid(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    const psId = getRequestedProblemId(data);
    return adminRemoveSelectionByPsid(psId);
  });
}


function apiAdminRemoveAllSelections(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return adminRemoveAllSelections();
  });
}


function apiAdminSetAllowReset(idToken, data) {
  return apiCall_(function() {
    requireAdmin(idToken);
    let val = data;
    if (data && typeof data === "object") {
      val = data.allowResetSelection !== undefined ? data.allowResetSelection : (data.allowSelectionReset !== undefined ? data.allowSelectionReset : data.flag);
    }
    const flag = String(val === true ? "TRUE" : val === false ? "FALSE" : val || "").trim();
    return adminSetAllowSelectionReset(flag);
  });
}


function apiAdminGetSelections(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminSelections();
  });
}


function apiAdminGetAllData(idToken) {
  return apiCall_(function() {
    requireAdmin(idToken);
    return getAdminAllData();
  });
}