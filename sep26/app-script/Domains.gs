function getDomainById(domainId) {
  const normalizedDomainId = String(domainId || "").trim().toUpperCase();
  const domains = getSheetRecords(SHEET_NAMES.DOMAINS);

  for (let i = 0; i < domains.length; i++) {
    if (String(domains[i].DomainID).trim().toUpperCase() === normalizedDomainId) {
      return domains[i];
    }
  }

  return null;
}


function getActiveDomains() {
  return getSheetRecords(SHEET_NAMES.DOMAINS).filter(function(domain) {
    return String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE;
  });
}


function getLockedSelectionCountByDomain(domainId) {
  const normalizedDomainId = String(domainId || "").trim().toUpperCase();

  return getSheetRecords(SHEET_NAMES.SELECTIONS).filter(function(selection) {
    return String(selection.Status || "").trim().toUpperCase() === SELECTION_STATUS.LOCKED &&
      String(selection.DomainID || "").trim().toUpperCase() === normalizedDomainId;
  }).length;
}


function getParticipantDomains(idToken) {
  return getActiveDomains().map(function(domain) {
    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);
    const remainingCapacity = Math.max(maximumTeams - currentLockedTeams, 0);

    return {
      domainId: String(domain.DomainID).trim().toUpperCase(),
      domainName: String(domain.DomainName || "").trim(),
      maximumTeams: maximumTeams,
      currentLockedTeams: currentLockedTeams,
      remainingCapacity: remainingCapacity,
      available: remainingCapacity > 0
    };
  });
}


function selectDomain(idToken, dataOrDomainId) {
  const domainId = String(
    (typeof dataOrDomainId === "object" && dataOrDomainId !== null)
      ? dataOrDomainId.domainId || dataOrDomainId.DomainID
      : dataOrDomainId || ""
  ).trim().toUpperCase();

  if (!domainId) {
    throwApiError("DomainID is required.", "INVALID_REQUEST");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const authorization = requireTeamLeader(idToken);
    const team = authorization.team;

    if (team.DomainID && String(team.DomainID).trim()) {
      throwApiError("Domain has already been selected for this team.", "DOMAIN_ALREADY_SELECTED");
    }

    const domain = getDomainById(domainId);

    if (!domain) {
      throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
    }

    if (String(domain.Status || "").trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("The requested domain is disabled.", "DOMAIN_DISABLED");
    }

    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);

    if (currentLockedTeams >= maximumTeams) {
      throwApiError("The requested domain has reached its team capacity.", "DOMAIN_CAPACITY_REACHED");
    }

    const sheet = getSheet(SHEET_NAMES.TEAMS);
    let headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);

    if (!headerMap.DomainID) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue("DomainID");
      headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    }

    const rowNum = findSheetRowNumber(SHEET_NAMES.TEAMS, "TeamID", team.TeamID);

    if (!rowNum) {
      throwApiError("Team record could not be found.", "TEAM_NOT_FOUND");
    }

    sheet.getRange(rowNum, headerMap.DomainID).setValue(domainId);

    return {
      success: true,
      data: {
        teamId: String(team.TeamID).trim(),
        domainId: domainId
      }
    };
  } finally {
    lock.releaseLock();
  }
}


function parsePositiveInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : 0;
}