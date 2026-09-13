function validateSelectionRequest(data) {
  const domainId = String(data && data.domainId || "").trim().toUpperCase();
  const psId = String(data && data.psId || "").trim().toUpperCase();

  if (!domainId || !psId) {
    throwApiError(
      "Both domainId and psId are required.",
      "INVALID_REQUEST"
    );
  }

  return {
    domainId: domainId,
    psId: psId
  };
}


function getSelectionByTeamId(teamId) {
  const normalizedTeamId = String(teamId || "").trim();
  if (!normalizedTeamId || normalizedTeamId.toLowerCase() === "undefined") return null;

  return getSheetRecords(SHEET_NAMES.SELECTIONS).find(function(selection) {
    const sTeamId = String(selection.TeamID || selection.teamId || selection["Team ID"] || "").trim();
    return sTeamId === normalizedTeamId;
  }) || null;
}


function getLockedSelectionByTeamId(teamId) {
  const normalizedTeamId = String(teamId || "").trim();
  if (!normalizedTeamId || normalizedTeamId.toLowerCase() === "undefined") return null;

  return getSheetRecords(SHEET_NAMES.SELECTIONS).find(function(selection) {
    const sTeamId = String(selection.TeamID || selection.teamId || selection["Team ID"] || "").trim();
    return sTeamId === normalizedTeamId &&
      String(selection.Status || selection.status || "").trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }) || null;
}


function getSelectionByProblemId(psId) {
  const normalizedPsId = String(psId || "").trim().toUpperCase();
  if (!normalizedPsId) return null;

  return getSheetRecords(SHEET_NAMES.SELECTIONS).find(function(selection) {
    const sPsId = String(selection.PSID || selection.psId || "").trim().toUpperCase();
    return sPsId === normalizedPsId;
  }) || null;
}


function getLockedSelectionByProblemId(psId) {
  const normalizedPsId = String(psId || "").trim().toUpperCase();
  if (!normalizedPsId) return null;

  return getSheetRecords(SHEET_NAMES.SELECTIONS).find(function(selection) {
    const sPsId = String(selection.PSID || selection.psId || "").trim().toUpperCase();
    return sPsId === normalizedPsId &&
      String(selection.Status || selection.status || "").trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }) || null;
}


function getLockedSelectionByTeam(teamId) {
  return getLockedSelectionByTeamId(teamId);
}


function getSelectionProblem(selection) {
  if (!selection) {
    return null;
  }

  const problem = getProblemById(selection.PSID);

  if (!problem) {
    return null;
  }

  return {
    title: String(problem.Title || "").trim(),
    description: String(problem.Description || "").trim(),
    whatToBuild: String(problem.WhatToBuild || "").trim()
  };
}


function formatSelection(selection) {
  if (!selection) {
    return null;
  }

  return {
    teamId: String(selection.TeamID).trim(),
    domainId: String(selection.DomainID).trim().toUpperCase(),
    psId: String(selection.PSID).trim(),
    selectedAt: selection.SelectedAt,
    status: String(selection.Status).trim().toUpperCase(),
    problem: getSelectionProblem(selection)
  };
}


function selectProblem(idToken, data) {
  requireTeamLeader(idToken);
  const request = validateSelectionRequest(data);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const authorization = requireTeamLeader(idToken);
    const team = authorization.team;
    const teamId = String(
      team && (team.teamId || team.TeamID || team["Team ID"] || team.TeamId) || ""
    ).trim();

    if (!teamId || teamId.toLowerCase() === "undefined" || teamId.toLowerCase() === "null") {
      throwApiError("Team ID is missing before selection persistence.", "SELECTION_TEAM_ID_MISSING");
    }

    const domain = getDomainById(request.domainId);
    if (!domain) {
      throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
    }

    if (String(domain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("The requested domain is disabled.", "DOMAIN_DISABLED");
    }

    if (!isSelectionOpen()) {
      throwApiError("Problem selection is closed.", "SELECTION_CLOSED");
    }

    if (!isProblemReleased()) {
      throwApiError(
        "Problem statements have not been released yet.",
        "PROBLEMS_NOT_RELEASED"
      );
    }

    const problem = getProblemById(request.psId);
    if (!problem) {
      throwApiError("The requested problem was not found.", "PROBLEM_NOT_FOUND");
    }

    if (String(problem.Status).trim().toUpperCase() !== PROBLEM_STATUS.ACTIVE) {
      throwApiError("The requested problem is disabled.", "PROBLEM_DISABLED");
    }

    const probDomain = String(problem.DomainID || "").trim().toUpperCase();
    const domainName = String(domain.DomainName || "").trim().toUpperCase();
    const psIdPrefix = String(problem.PSID || "").trim().toUpperCase();
    if (probDomain !== request.domainId && probDomain !== domainName && !psIdPrefix.startsWith(request.domainId + "-")) {
      throwApiError(
        "The problem does not belong to the requested domain.",
        "PROBLEM_DOMAIN_MISMATCH"
      );
    }

    if (getLockedSelectionByTeamId(teamId)) {
      throwApiError(
        "This team already has a locked problem.",
        "TEAM_ALREADY_HAS_SELECTION"
      );
    }

    if (getLockedSelectionByProblemId(problem.PSID)) {
      throwApiError(
        "The requested problem has already been selected.",
        "PROBLEM_ALREADY_LOCKED"
      );
    }

    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);

    if (currentLockedTeams >= maximumTeams) {
      throwApiError(
        "The requested domain has reached its team capacity.",
        "DOMAIN_CAPACITY_REACHED"
      );
    }

    const selectedAt = new Date();
    const sheet = getSheet(SHEET_NAMES.SELECTIONS);
    sheet.appendRow([
      teamId,
      request.domainId,
      String(problem.PSID).trim(),
      selectedAt,
      SELECTION_STATUS.LOCKED
    ]);
    SpreadsheetApp.flush();

    const lastRowIndex = sheet.getLastRow();
    const writtenRowValues = sheet.getRange(lastRowIndex, 1, 1, 5).getValues()[0];
    const writtenTeamId = String(writtenRowValues[0] || "").trim();
    if (writtenTeamId !== teamId) {
      throwApiError(
        "Selection persistence failed: expected TeamID " + teamId + ", found " + (writtenTeamId || "[blank]") + ".",
        "SELECTION_PERSISTENCE_FAILED"
      );
    }

    return {
      success: true,
      data: formatSelection({
        TeamID: teamId,
        DomainID: request.domainId,
        PSID: problem.PSID,
        SelectedAt: selectedAt,
        Status: SELECTION_STATUS.LOCKED
      })
    };
  } finally {
    lock.releaseLock();
  }
}


function getMySelection(idToken) {
  const authorization = requireTeamLeader(idToken);
  const teamId = String(
    authorization.team && (authorization.team.teamId || authorization.team.TeamID || authorization.team["Team ID"]) || ""
  ).trim();
  const selection = getLockedSelectionByTeamId(teamId);

  return {
    success: true,
    data: {
      hasSelection: selection !== null,
      selection: formatSelection(selection)
    }
  };
}


function lockProblem(idToken, data) {
  const authorization = requireTeamLeader(idToken);
  const initialTeam = authorization.team;
  const teamId = String(
    initialTeam && (initialTeam.teamId || initialTeam.TeamID || initialTeam["Team ID"] || initialTeam.TeamId) || ""
  ).trim();

  if (!teamId || teamId.toLowerCase() === "undefined" || teamId.toLowerCase() === "null") {
    throwApiError("Team ID is missing before selection persistence.", "SELECTION_TEAM_ID_MISSING");
  }

  const psId = String(data && (data.psid || data.psId || data.PSID) || "")
    .trim()
    .toUpperCase();

  if (!psId) {
    throwApiError("A problem identifier is required.", "INVALID_REQUEST");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const auth = requireTeamLeader(idToken);
    const team = auth.team;
    const currentTeamId = String(
      team && (team.teamId || team.TeamID || team["Team ID"] || team.TeamId) || ""
    ).trim();

    if (!currentTeamId || currentTeamId.toLowerCase() === "undefined" || currentTeamId.toLowerCase() === "null") {
      throwApiError("Team ID is missing before selection persistence.", "SELECTION_TEAM_ID_MISSING");
    }

    if (!isSelectionOpen()) {
      throwApiError("Problem selection is closed.", "SELECTION_CLOSED");
    }

    if (!isProblemReleased()) {
      throwApiError("Problem statements have not been released yet.", "PROBLEMS_NOT_RELEASED");
    }

    const existingTeamSelection = getLockedSelectionByTeamId(currentTeamId);
    if (existingTeamSelection) {
      throwApiError("Your team has already locked a problem.", "TEAM_ALREADY_LOCKED");
    }

    const problem = getProblemById(psId);
    if (!problem) {
      throwApiError("The requested problem was not found.", "INVALID_PROBLEM");
    }

    const teamDomainId = String(team.DomainID || "").trim().toUpperCase();
    const problemDomainId = String(problem.DomainID || "").trim().toUpperCase();
    const psIdUpper = String(problem.PSID || "").trim().toUpperCase();

    if (!teamDomainId || teamDomainId.toLowerCase() === "undefined" || teamDomainId.toLowerCase() === "null") {
      throwApiError("Domain ID is missing before selection persistence.", "SELECTION_DOMAIN_ID_MISSING");
    }

    const teamDomainObj = getDomainById(teamDomainId);
    const teamDomainName = teamDomainObj ? String(teamDomainObj.DomainName || "").trim().toUpperCase() : "";
    const domainMatches =
      problemDomainId === teamDomainId ||
      (teamDomainName && problemDomainId === teamDomainName) ||
      psIdUpper.startsWith(teamDomainId + "-");

    if (!domainMatches) {
      throwApiError("The requested problem is not available for your registered domain.", "WRONG_DOMAIN");
    }

    if (String(problem.Status || "").trim().toUpperCase() !== PROBLEM_STATUS.ACTIVE) {
      throwApiError("The requested problem is not available.", "PROBLEM_DISABLED");
    }

    if (getLockedSelectionByProblemId(psId)) {
      throwApiError("This problem has already been locked by another team.", "PROBLEM_ALREADY_LOCKED");
    }

    const domain = getDomainById(teamDomainId);
    if (!domain || String(domain.Status || "").trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("Your registered domain is not available.", "DOMAIN_DISABLED");
    }

    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    if (getLockedSelectionCountByDomain(teamDomainId) >= maximumTeams) {
      throwApiError("Your registered domain has reached capacity.", "DOMAIN_CAPACITY_REACHED");
    }

    const selectedAt = new Date();
    const sheet = getSheet(SHEET_NAMES.SELECTIONS);

    sheet.appendRow([
      currentTeamId,
      teamDomainId,
      psIdUpper,
      selectedAt,
      SELECTION_STATUS.LOCKED
    ]);
    SpreadsheetApp.flush();

    const lastRowIndex = sheet.getLastRow();
    const writtenValues = sheet.getRange(lastRowIndex, 1, 1, 5).getValues()[0];
    const writtenTeamId = String(writtenValues[0] || "").trim();
    const writtenDomainId = String(writtenValues[1] || "").trim().toUpperCase();
    const writtenPsId = String(writtenValues[2] || "").trim().toUpperCase();
    const writtenStatus = String(writtenValues[4] || "").trim().toUpperCase();

    if (
      writtenTeamId !== currentTeamId ||
      writtenDomainId !== teamDomainId ||
      writtenPsId !== psIdUpper ||
      writtenStatus !== SELECTION_STATUS.LOCKED
    ) {
      throwApiError(
        "Selection persistence failed: expected TeamID " + currentTeamId + ", found " + (writtenTeamId || "[blank]") + ".",
        "SELECTION_PERSISTENCE_FAILED"
      );
    }

    return formatSelection({
      TeamID: currentTeamId,
      DomainID: teamDomainId,
      PSID: psIdUpper,
      SelectedAt: selectedAt,
      Status: SELECTION_STATUS.LOCKED
    });
  } finally {
    lock.releaseLock();
  }
}