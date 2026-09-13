function requireAdminAction(idToken) {
  return requireAdmin(idToken);
}


function getTeamRegisterNumbers(team) {
  return [
    team.LeaderRegisterNumber,
    team.Member1RegisterNumber,
    team.Member2RegisterNumber,
    team.Member3RegisterNumber,
    team.Member4RegisterNumber
  ].map(normalizeRegisterNumber).filter(Boolean);
}


function validateAdminTeamData(data) {
  if (!data) {
    throwApiError("Team data is required.", "INVALID_TEAM_DATA");
  }
  const teamName = String(data.teamName || "").trim();
  if (!teamName) {
    throwApiError("Team name is required.", "INVALID_TEAM_DATA");
  }
  const leaderName = String(data.leaderName || "").trim();
  if (!leaderName) {
    throwApiError("Leader name is required.", "INVALID_TEAM_DATA");
  }
  normalizeAndValidateMobile(data.leaderMobile);

  const email = normalizeEmail(data.leaderEmail);
  if (!email || !email.endsWith(COLLEGE_EMAIL_DOMAIN)) {
    throwApiError("The team leader must use a college email address.", "INVALID_TEAM_DATA");
  }

  const leaderReg = normalizeRegisterNumber(data.leaderRegisterNumber);
  if (!leaderReg) {
    throwApiError("Leader register number is required.", "INVALID_TEAM_DATA");
  }

  const leaderDept = String(data.leaderDepartment || "").trim();
  if (!leaderDept) {
    throwApiError("Leader department is required.", "INVALID_TEAM_DATA");
  }
}


function getColForHeader(headerMap, canonicalName) {
  if (headerMap[canonicalName]) return headerMap[canonicalName];
  const targetNorm = normalizeHeaderKey(canonicalName);
  for (const key in headerMap) {
    if (normalizeHeaderKey(key) === targetNorm) {
      return headerMap[key];
    }
  }
  return null;
}


function checkAdminTeamDuplicates(data, excludedTeamId) {
  const submittedNumbers = [data.leaderRegisterNumber].concat(
    (data.members || []).map(function(member) {
      return member.registerNumber;
    })
  ).map(normalizeRegisterNumber).filter(Boolean);
  const uniqueNumbers = new Set(submittedNumbers);

  if (uniqueNumbers.size !== submittedNumbers.length) {
    throwApiError("Register numbers must be unique within the team.", "DUPLICATE_REGISTER_NUMBER");
  }

  const email = normalizeEmail(data.leaderEmail);
  const teams = getSheetRecords(SHEET_NAMES.TEAMS);

  teams.forEach(function(team) {
    if (excludedTeamId && String(team.TeamID).trim() === String(excludedTeamId).trim()) {
      return;
    }

    if (normalizeEmail(team.LeaderEmail) === email) {
      throwApiError("This team leader email is already registered.", "TEAM_ALREADY_REGISTERED");
    }

    const existingNumbers = getTeamRegisterNumbers(team);

    submittedNumbers.forEach(function(registerNumber) {
      if (existingNumbers.includes(registerNumber)) {
        throwApiError(
          "Register number " + registerNumber + " is already registered in another team.",
          "DUPLICATE_REGISTER_NUMBER"
        );
      }
    });
  });
}


function getAdminTeam(team, lockedSelections) {
  const members = [];
  [1, 2, 3, 4].forEach(function(index) {
    var name = String(team["Member" + index + "Name"] || "").trim();
    var registerNumber = normalizeRegisterNumber(team["Member" + index + "RegisterNumber"]);
    var department = String(team["Member" + index + "Department"] || "").trim();

    if (name || registerNumber || department) {
      members.push({ name: name, registerNumber: registerNumber, department: department });
    }
  });

  const teamId = String(team.TeamID || team.teamId || team["Team ID"] || team["Column 1"] || "").trim();

  var selection = lockedSelections.find(function(item) {
    const sTeamId = String(item.TeamID || item.teamId || item["Team ID"] || "").trim();
    return sTeamId && sTeamId === teamId;
  }) || null;

  return {
    TeamID: teamId,
    teamId: teamId,
    TeamName: String(team.TeamName || "").trim(),
    LeaderName: String(team.LeaderName || "").trim(),
    LeaderEmail: normalizeEmail(team.LeaderEmail),
    LeaderMobile: String(team.LeaderMobile || team.LeaderMobileNumber || "").trim(),
    LeaderRegisterNumber: normalizeRegisterNumber(team.LeaderRegisterNumber),
    LeaderDepartment: String(team.LeaderDepartment || "").trim(),
    Members: members,
    DomainID: String(team.DomainID || "").trim().toUpperCase(),
    Status: String(team.Status || "").trim().toUpperCase(),
    CreatedAt: team.CreatedAt,
    Selection: selection ? formatSelection(selection) : null
  };
}


function getAdminTeams(data) {
  const filter = String(data && data.status || "").trim().toUpperCase();
  const lockedSelections = getSheetRecords(SHEET_NAMES.SELECTIONS).filter(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  });

  return getSheetRecords(SHEET_NAMES.TEAMS)
    .filter(function(team) {
      return !filter || String(team.Status).trim().toUpperCase() === filter;
    })
    .map(function(team) {
      return getAdminTeam(team, lockedSelections);
    });
}


function adminAddTeam(data) {
  validateAdminTeamData(data || {});
  checkAdminTeamDuplicates(data, null);
  return createTeam(data);
}


// Admin-authorized team creation that does NOT require registration to be open.
// Reuses all validation, ID generation, duplicate checks, domain capacity checks,
// and persistence/readback verification from createTeam() — but skips
// checkRegistrationOpen() which is a participant-only gate.
function adminCreateTeamDirect(data) {
  Logger.log("ADMIN_CREATE_TEAM_START: Processing admin direct team creation.");

  validateAdminTeamData(data || {});

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    checkAdminTeamDuplicates(data, null);
    Logger.log("ADMIN_CREATE_TEAM_DUPLICATES: Duplicate check passed.");

    const normalizedMobile = normalizeAndValidateMobile(data.leaderMobile);

    const domainId = String(data.domainId || data.DomainID || "").trim().toUpperCase();
    if (!domainId) {
      throwApiError("Domain selection is required.", "DOMAIN_REQUIRED");
    }
    const domain = getDomainById(domainId);
    if (!domain) {
      throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
    }
    if (String(domain.Status || "").trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("The requested domain is disabled.", "DOMAIN_DISABLED");
    }
    Logger.log("ADMIN_CREATE_TEAM_DOMAIN: Domain " + domainId + " validated.");

    const teamId = generateNextTeamIdWithoutLock();
    if (!teamId || typeof teamId !== "string" || !teamId.trim() || !teamId.startsWith(TEAM_ID_PREFIX)) {
      throwApiError("Failed to generate a valid Team ID.", "TEAM_ID_GENERATION_FAILED");
    }
    Logger.log("ADMIN_CREATE_TEAM_ID: " + teamId);

    const sheet = getSheet(SHEET_NAMES.TEAMS);
    const members = data.members || [];
    function getMember(index) { return members[index] || {}; }
    const member1 = getMember(0);
    const member2 = getMember(1);
    const member3 = getMember(2);
    const member4 = getMember(3);

    let headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    if (!headerMap.LeaderMobileNumber && !headerMap.LeaderMobile) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue("LeaderMobileNumber");
      headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    }
    if (!headerMap.DomainID) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue("DomainID");
      headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    }

    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(h) {
      return String(h).trim();
    });
    const targetTeamIdCol = getTeamIdColumn(sheet);
    const fieldMap = {
      TEAMID: teamId,
      TEAMNAME: String(data.teamName || "").trim(),
      LEADERNAME: String(data.leaderName || "").trim(),
      LEADEREMAIL: normalizeEmail(data.leaderEmail),
      LEADERMOBILENUMBER: normalizedMobile,
      LEADERMOBILE: normalizedMobile,
      LEADERREGISTERNUMBER: normalizeRegisterNumber(data.leaderRegisterNumber),
      LEADERDEPARTMENT: String(data.leaderDepartment || "").trim(),
      MEMBER1NAME: String(member1.name || "").trim(),
      MEMBER1REGISTERNUMBER: normalizeRegisterNumber(member1.registerNumber),
      MEMBER1DEPARTMENT: String(member1.department || "").trim(),
      MEMBER2NAME: String(member2.name || "").trim(),
      MEMBER2REGISTERNUMBER: normalizeRegisterNumber(member2.registerNumber),
      MEMBER2DEPARTMENT: String(member2.department || "").trim(),
      MEMBER3NAME: String(member3.name || "").trim(),
      MEMBER3REGISTERNUMBER: normalizeRegisterNumber(member3.registerNumber),
      MEMBER3DEPARTMENT: String(member3.department || "").trim(),
      MEMBER4NAME: String(member4.name || "").trim(),
      MEMBER4REGISTERNUMBER: normalizeRegisterNumber(member4.registerNumber),
      MEMBER4DEPARTMENT: String(member4.department || "").trim(),
      STATUS: TEAM_STATUS.ACTIVE,
      CREATEDAT: new Date(),
      DOMAINID: domainId
    };

    const rowToAppend = headers.map(function(header, index) {
      if (index + 1 === targetTeamIdCol) return teamId;
      const normalizedHeader = normalizeHeaderKey(header);
      return Object.prototype.hasOwnProperty.call(fieldMap, normalizedHeader) ? fieldMap[normalizedHeader] : "";
    });

    if (rowToAppend.length !== lastColumn) {
      throwApiError("Row column count mismatch with sheet headers.", "ROW_LENGTH_MISMATCH");
    }
    if (!rowToAppend[targetTeamIdCol - 1] || String(rowToAppend[targetTeamIdCol - 1]).trim() !== teamId) {
      throwApiError("Failed to map Team ID to target row column.", "TEAM_ID_COLUMN_MAPPING_FAILED");
    }

    Logger.log("ADMIN_CREATE_TEAM_WRITE: Appending row for " + teamId);
    sheet.appendRow(rowToAppend);
    SpreadsheetApp.flush();
    const insertedRowIndex = sheet.getLastRow();
    const writtenTeamId = String(sheet.getRange(insertedRowIndex, targetTeamIdCol).getValue()).trim();
    if (writtenTeamId !== teamId) {
      throwApiError("Admin team creation persistence verification failed.", "REGISTRATION_PERSISTENCE_FAILED");
    }
    Logger.log("ADMIN_CREATE_TEAM_SUCCESS: Team " + teamId + " persisted.");

    return {
      success: true,
      data: {
        teamId: teamId,
        teamName: String(data.teamName || "").trim(),
        domainId: domainId,
        domainName: domain ? String(domain.DomainName || "").trim() : domainId,
        status: TEAM_STATUS.ACTIVE
      }
    };
  } catch (err) {
    Logger.log("ADMIN_CREATE_TEAM_FAILURE: " + (err.message || err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}


function adminUpdateTeam(data) {
  const teamId = String(data && (data.teamId || data.TeamID) || "").trim();

  if (!teamId) {
    throwApiError("TeamID is required.", "INVALID_TEAM_DATA");
  }

  const existingTeam = getSheetRecords(SHEET_NAMES.TEAMS).find(function(team) {
    return String(team.TeamID).trim() === teamId;
  });

  if (!existingTeam) {
    throwApiError("The requested team was not found.", "TEAM_NOT_FOUND");
  }

  const updated = {
    teamName: data.teamName,
    leaderName: data.leaderName,
    leaderEmail: data.leaderEmail,
    leaderMobile: data.leaderMobile,
    leaderRegisterNumber: data.leaderRegisterNumber,
    leaderDepartment: data.leaderDepartment,
    members: data.members || [],
    domainId: String(data.domainId || existingTeam.DomainID || "").trim().toUpperCase()
  };

  validateAdminTeamData(updated);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    checkAdminTeamDuplicates(updated, teamId);
    if (getLockedSelectionByTeamId(teamId) && updated.domainId !== String(existingTeam.DomainID || "").trim().toUpperCase()) {
      throwApiError("A team with a locked problem cannot change domain.", "TEAM_ALREADY_ALLOCATED");
    }
    const rowNumber = findSheetRowNumber(SHEET_NAMES.TEAMS, "TeamID", teamId);

    if (!rowNumber) {
      throwApiError("The requested team was not found.", "TEAM_NOT_FOUND");
    }

    const sheet = getSheet(SHEET_NAMES.TEAMS);
    const headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);

    const values = {
      TeamName: String(updated.teamName).trim(),
      LeaderName: String(updated.leaderName).trim(),
      LeaderEmail: normalizeEmail(updated.leaderEmail),
      LeaderMobileNumber: String(updated.leaderMobile).trim(),
      LeaderMobile: String(updated.leaderMobile).trim(),
      LeaderRegisterNumber: normalizeRegisterNumber(updated.leaderRegisterNumber),
      LeaderDepartment: String(updated.leaderDepartment).trim(),
      DomainID: updated.domainId
    };

    [1, 2, 3, 4].forEach(function(index) {
      const member = updated.members[index - 1] || {};
      values["Member" + index + "Name"] = String(member.name || "").trim();
      values["Member" + index + "RegisterNumber"] = normalizeRegisterNumber(member.registerNumber);
      values["Member" + index + "Department"] = String(member.department || "").trim();
    });

    Object.keys(values).forEach(function(header) {
      const col = getColForHeader(headerMap, header);
      if (col) {
        sheet.getRange(rowNumber, col).setValue(values[header]);
      }
    });

    SpreadsheetApp.flush();

    return getAdminTeam(getSheetRecords(SHEET_NAMES.TEAMS).find(function(team) {
      return String(team.TeamID).trim() === teamId;
    }), getSheetRecords(SHEET_NAMES.SELECTIONS));
  } finally {
    lock.releaseLock();
  }
}


function setTeamStatus(teamId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rowNumber = findSheetRowNumber(SHEET_NAMES.TEAMS, "TeamID", teamId);

    if (!rowNumber) {
      throwApiError("The requested team was not found.", "TEAM_NOT_FOUND");
    }

    const headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    getSheet(SHEET_NAMES.TEAMS).getRange(rowNumber, headerMap.Status).setValue(status);

    return { success: true, data: { teamId: String(teamId).trim(), status: status } };
  } finally {
    lock.releaseLock();
  }
}


function adminEnableTeam(teamId) {
  return setTeamStatus(teamId, TEAM_STATUS.ACTIVE);
}


function adminDisableTeam(teamId) {
  return setTeamStatus(teamId, TEAM_STATUS.DISABLED);
}


function getAdminProblems() {
  return getSheetRecords(SHEET_NAMES.PROBLEMS).map(function(problem) {
    return {
      PSID: String(problem.PSID).trim(),
      DomainID: String(problem.DomainID).trim().toUpperCase(),
      Title: String(problem.Title || "").trim(),
      Description: String(problem.Description || "").trim(),
      WhatToBuild: String(problem.WhatToBuild || "").trim(),
      Status: String(problem.Status || "").trim().toUpperCase()
    };
  });
}


function validateProblemFields(data) {
  if (!String(data.title || "").trim() ||
      !String(data.description || "").trim() ||
      !String(data.whatToBuild || "").trim()) {
    throwApiError("Title, description, and whatToBuild are required.", "INVALID_PROBLEM_DATA");
  }
}


function generateNextProblemIdWithoutLock(domainId) {
  const prefix = String(domainId).trim().toUpperCase() + "-";
  let maxNumber = 0;

  getProblemsByDomain(domainId).forEach(function(problem) {
    const psId = String(problem.PSID).trim().toUpperCase();

    if (psId.indexOf(prefix) !== 0) {
      return;
    }

    const number = parseInt(psId.substring(prefix.length), 10);

    if (!isNaN(number)) {
      maxNumber = Math.max(maxNumber, number);
    }
  });

  return prefix + String(maxNumber + 1).padStart(2, "0");
}


function adminAddProblem(data) {
  const domainId = String(data && data.domainId || "").trim().toUpperCase();
  const domain = getDomainById(domainId);

  if (!domain) {
    throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
  }

  if (String(domain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
    throwApiError("The requested domain is disabled.", "DOMAIN_DISABLED");
  }

  validateProblemFields(data || {});

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const currentDomain = getDomainById(domainId);

    if (!currentDomain || String(currentDomain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("The requested domain is disabled.", "DOMAIN_DISABLED");
    }

    const psId = generateNextProblemIdWithoutLock(domainId);
    getSheet(SHEET_NAMES.PROBLEMS).appendRow([
      psId,
      domainId,
      String(data.title).trim(),
      String(data.description).trim(),
      String(data.whatToBuild).trim(),
      PROBLEM_STATUS.ACTIVE
    ]);

    return getAdminProblems().find(function(problem) {
      return String(problem.PSID).trim().toUpperCase() === psId;
    });
  } finally {
    lock.releaseLock();
  }
}


function getProblemRequestId(data) {
  return String(data && (data.psId || data.PSID) || "").trim().toUpperCase();
}


function setProblemStatus(psId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rowNumber = findSheetRowNumber(SHEET_NAMES.PROBLEMS, "PSID", psId);

    if (!rowNumber) {
      throwApiError("The requested problem was not found.", "PROBLEM_NOT_FOUND");
    }

    const headerMap = getSheetHeaderMap(SHEET_NAMES.PROBLEMS);
    getSheet(SHEET_NAMES.PROBLEMS).getRange(rowNumber, headerMap.Status).setValue(status);

    return getAdminProblems().find(function(problem) {
      return String(problem.PSID).trim().toUpperCase() === String(psId).trim().toUpperCase();
    });
  } finally {
    lock.releaseLock();
  }
}


function adminUpdateProblem(data) {
  const psId = getProblemRequestId(data);
  const existing = getProblemById(psId);

  if (!existing) {
    throwApiError("The requested problem was not found.", "PROBLEM_NOT_FOUND");
  }

  const domainId = String(data.domainId || existing.DomainID).trim().toUpperCase();
  const domain = getDomainById(domainId);

  if (!domain) {
    throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
  }

  if (String(domain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
    throwApiError("The destination domain is disabled.", "DOMAIN_DISABLED");
  }

  if (getLockedSelectionByProblemId(psId) &&
      String(existing.DomainID).trim().toUpperCase() !== domainId) {
    throwApiError(
      "A locked problem cannot be moved to another domain.",
      "PROBLEM_ALREADY_LOCKED"
    );
  }

  const updated = {
    title: data.title === undefined ? existing.Title : data.title,
    description: data.description === undefined ? existing.Description : data.description,
    whatToBuild: data.whatToBuild === undefined ? existing.WhatToBuild : data.whatToBuild
  };
  validateProblemFields(updated);

  const status = data.status === undefined
    ? String(existing.Status).trim().toUpperCase()
    : String(data.status).trim().toUpperCase();

  if (status !== PROBLEM_STATUS.ACTIVE && status !== PROBLEM_STATUS.DISABLED) {
    throwApiError("Problem status is invalid.", "INVALID_PROBLEM_DATA");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const currentDomain = getDomainById(domainId);

    if (!currentDomain || String(currentDomain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE) {
      throwApiError("The destination domain is disabled.", "DOMAIN_DISABLED");
    }

    const lockedSelection = getLockedSelectionByProblemId(psId);
    const currentProblem = getProblemById(psId);

    if (lockedSelection && currentProblem &&
        String(currentProblem.DomainID).trim().toUpperCase() !== domainId) {
      throwApiError(
        "A locked problem cannot be moved to another domain.",
        "PROBLEM_ALREADY_LOCKED"
      );
    }

    const rowNumber = findSheetRowNumber(SHEET_NAMES.PROBLEMS, "PSID", psId);
    const sheet = getSheet(SHEET_NAMES.PROBLEMS);
    const headerMap = getSheetHeaderMap(SHEET_NAMES.PROBLEMS);
    const values = {
      DomainID: domainId,
      Title: String(updated.title).trim(),
      Description: String(updated.description).trim(),
      WhatToBuild: String(updated.whatToBuild).trim(),
      Status: status
    };

    Object.keys(values).forEach(function(header) {
      sheet.getRange(rowNumber, headerMap[header]).setValue(values[header]);
    });

    return getAdminProblems().find(function(problem) {
      return String(problem.PSID).trim().toUpperCase() === psId;
    });
  } finally {
    lock.releaseLock();
  }
}


function adminEnableProblem(psId) {
  return setProblemStatus(psId, PROBLEM_STATUS.ACTIVE);
}


function adminDisableProblem(psId) {
  return setProblemStatus(psId, PROBLEM_STATUS.DISABLED);
}


// Returns count of teams registered for a domain (by DomainID in Teams sheet).
// This is a different metric from locked problem selections.
function getRegisteredTeamCountByDomain(domainId) {
  const normalizedDomainId = String(domainId || "").trim().toUpperCase();
  return getSheetRecords(SHEET_NAMES.TEAMS).filter(function(team) {
    return String(team.DomainID || "").trim().toUpperCase() === normalizedDomainId &&
      String(team.Status || "").trim().toUpperCase() === TEAM_STATUS.ACTIVE;
  }).length;
}


function getAdminDomains() {
  return getSheetRecords(SHEET_NAMES.DOMAINS).map(function(domain) {
    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);
    const registeredTeams = getRegisteredTeamCountByDomain(domain.DomainID);

    return {
      DomainID: String(domain.DomainID).trim().toUpperCase(),
      DomainName: String(domain.DomainName || "").trim(),
      MaximumTeams: maximumTeams,
      Status: String(domain.Status || "").trim().toUpperCase(),
      RegisteredTeams: registeredTeams,
      CurrentLockedTeams: currentLockedTeams,
      RemainingCapacity: Math.max(maximumTeams - currentLockedTeams, 0),
      Available: String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE &&
        currentLockedTeams < maximumTeams
    };
  });
}


// Dedicated function returning authoritative selection data from the Selections sheet.
// Enriches each selection with teamName, domainName, and problemTitle for admin display.
function getAdminSelections() {
  const selections = getSheetRecords(SHEET_NAMES.SELECTIONS).filter(function(selection) {
    return String(selection.Status || "").trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  });

  const teams = getSheetRecords(SHEET_NAMES.TEAMS);
  const domains = getSheetRecords(SHEET_NAMES.DOMAINS);
  const problems = getSheetRecords(SHEET_NAMES.PROBLEMS);

  return selections.map(function(selection) {
    const teamId = String(selection.TeamID || "").trim();
    const domainId = String(selection.DomainID || "").trim().toUpperCase();
    const psId = String(selection.PSID || "").trim();

    const team = teams.find(function(t) {
      return String(t.TeamID || "").trim() === teamId;
    });
    const domain = domains.find(function(d) {
      return String(d.DomainID || "").trim().toUpperCase() === domainId;
    });
    const problem = problems.find(function(p) {
      return String(p.PSID || "").trim().toUpperCase() === psId.toUpperCase();
    });

    var selectedAt = selection.SelectedAt;
    if (selectedAt instanceof Date) {
      selectedAt = isNaN(selectedAt.getTime()) ? null : selectedAt.toISOString();
    } else if (selectedAt) {
      selectedAt = String(selectedAt).trim() || null;
    } else {
      selectedAt = null;
    }

    return {
      teamId: teamId,
      teamName: team ? String(team.TeamName || "").trim() : teamId,
      domainId: domainId,
      domainName: domain ? String(domain.DomainName || "").trim() : domainId,
      psId: psId,
      problemTitle: problem ? String(problem.Title || "").trim() : psId,
      selectedAt: selectedAt,
      status: String(selection.Status || "").trim().toUpperCase()
    };
  });
}


function adminUpdateDomain(data) {
  const domainId = String(data && (data.domainId || data.DomainID) || "").trim().toUpperCase();
  const existing = getDomainById(domainId);

  if (!existing) {
    throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
  }

  const domainName = String(data.domainName === undefined ? existing.DomainName : data.domainName).trim();
  const maximumTeams = parsePositiveInteger(
    data.maximumTeams === undefined ? existing.MaximumTeams : data.maximumTeams
  );
  const status = String(data.status === undefined ? existing.Status : data.status).trim().toUpperCase();

  if (!domainName || maximumTeams <= 0 ||
      (status !== DOMAIN_STATUS.ACTIVE && status !== DOMAIN_STATUS.DISABLED)) {
    throwApiError("Domain name, positive capacity, and valid status are required.", "INVALID_DOMAIN_DATA");
  }

  if (maximumTeams < getLockedSelectionCountByDomain(domainId)) {
    throwApiError("Capacity cannot be lower than current allocation.", "CAPACITY_BELOW_USAGE");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!getDomainById(domainId)) {
      throwApiError("The requested domain was not found.", "DOMAIN_NOT_FOUND");
    }

    const rowNumber = findSheetRowNumber(SHEET_NAMES.DOMAINS, "DomainID", domainId);
    const headerMap = getSheetHeaderMap(SHEET_NAMES.DOMAINS);
    const sheet = getSheet(SHEET_NAMES.DOMAINS);

    sheet.getRange(rowNumber, headerMap.DomainName).setValue(domainName);
    sheet.getRange(rowNumber, headerMap.MaximumTeams).setValue(maximumTeams);
    sheet.getRange(rowNumber, headerMap.Status).setValue(status);

    return getAdminDomains().find(function(domain) {
      return String(domain.DomainID).trim().toUpperCase() === domainId;
    });
  } finally {
    lock.releaseLock();
  }
}


function getTeamStatistics(teams, selections) {
  const activeTeams = teams.filter(function(team) {
    return String(team.Status).trim().toUpperCase() === TEAM_STATUS.ACTIVE;
  }).length;
  const disabledTeams = teams.filter(function(team) {
    return String(team.Status).trim().toUpperCase() === TEAM_STATUS.DISABLED;
  }).length;
  const activeTeamIds = new Set(teams.filter(function(team) {
    return String(team.Status).trim().toUpperCase() === TEAM_STATUS.ACTIVE;
  }).map(function(team) {
    return String(team.TeamID).trim();
  }));
  const lockedTeamIds = new Set(selections.filter(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }).map(function(selection) {
    return String(selection.TeamID).trim();
  }).filter(function(teamId) {
    return activeTeamIds.has(teamId);
  }));

  return {
    registeredTeams: teams.length,
    activeTeams: activeTeams,
    disabledTeams: disabledTeams,
    pendingTeams: Math.max(activeTeams - lockedTeamIds.size, 0)
  };
}


function getProblemStatistics(problems, selections, domains) {
  const lockedPsIds = new Set(selections.filter(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }).map(function(selection) {
    return String(selection.PSID).trim().toUpperCase();
  }));
  const activeDomainIds = new Set(domains.filter(function(domain) {
    return String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE;
  }).map(function(domain) {
    return String(domain.DomainID).trim().toUpperCase();
  }));
  const fullDomainIds = new Set(domains.filter(function(domain) {
    return String(domain.Status).trim().toUpperCase() !== DOMAIN_STATUS.ACTIVE ||
      getLockedSelectionCountByDomain(domain.DomainID) >= parsePositiveInteger(domain.MaximumTeams);
  }).map(function(domain) {
    return String(domain.DomainID).trim().toUpperCase();
  }));

  return {
    totalProblems: problems.length,
    activeProblems: problems.filter(function(problem) {
      return String(problem.Status).trim().toUpperCase() === PROBLEM_STATUS.ACTIVE;
    }).length,
    disabledProblems: problems.filter(function(problem) {
      return String(problem.Status).trim().toUpperCase() === PROBLEM_STATUS.DISABLED;
    }).length,
    availableProblems: isProblemReleased() && isSelectionOpen() ? problems.filter(function(problem) {
      return String(problem.Status).trim().toUpperCase() === PROBLEM_STATUS.ACTIVE &&
        activeDomainIds.has(String(problem.DomainID).trim().toUpperCase()) &&
        !fullDomainIds.has(String(problem.DomainID).trim().toUpperCase()) &&
        !lockedPsIds.has(String(problem.PSID).trim().toUpperCase());
    }).length : 0
  };
}


function getDomainStatistics(domains, selections, teams) {
  const allTeams = teams || getSheetRecords(SHEET_NAMES.TEAMS);
  return domains.map(function(domain) {
    const normalizedDomainId = String(domain.DomainID || "").trim().toUpperCase();
    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    // Locked selections: teams that have locked a problem in this domain
    const lockedTeams = selections.filter(function(selection) {
      return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED &&
        String(selection.DomainID).trim().toUpperCase() === normalizedDomainId;
    }).length;
    // Registered teams: active teams with DomainID set to this domain
    const registeredTeams = allTeams.filter(function(team) {
      return String(team.DomainID || "").trim().toUpperCase() === normalizedDomainId &&
        String(team.Status || "").trim().toUpperCase() === TEAM_STATUS.ACTIVE;
    }).length;

    return {
      domainId: normalizedDomainId,
      domainName: String(domain.DomainName || "").trim(),
      maximumTeams: maximumTeams,
      registeredTeams: registeredTeams,
      lockedTeams: lockedTeams,
      remainingCapacity: Math.max(maximumTeams - lockedTeams, 0),
      status: String(domain.Status).trim().toUpperCase()
    };
  });
}


function getAdminDashboardStats() {
  const teams = getSheetRecords(SHEET_NAMES.TEAMS);
  const problems = getSheetRecords(SHEET_NAMES.PROBLEMS);
  const selections = getSheetRecords(SHEET_NAMES.SELECTIONS);
  const domains = getSheetRecords(SHEET_NAMES.DOMAINS);
  const teamStats = getTeamStatistics(teams, selections);
  const problemStats = getProblemStatistics(problems, selections, domains);

  return {
    registeredTeams: teamStats.registeredTeams,
    activeTeams: teamStats.activeTeams,
    disabledTeams: teamStats.disabledTeams,
    lockedSelections: selections.filter(function(selection) {
      return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
    }).length,
    pendingTeams: teamStats.pendingTeams,
    totalProblems: problemStats.totalProblems,
    activeProblems: problemStats.activeProblems,
    disabledProblems: problemStats.disabledProblems,
    availableProblems: problemStats.availableProblems,
    totalActiveDomains: domains.filter(function(domain) {
      return String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE;
    }).length,
    domains: getDomainStatistics(domains, selections, teams),
    selectionStatus: String(getConfigValue("SelectionStatus") || "").trim().toUpperCase(),
    hackathonStatus: String(getConfigValue("HackathonStatus") || "").trim().toUpperCase(),
    problemReleaseDate: getConfigValue("ProblemReleaseDate"),
    problemReleaseTime: getConfigValue("ProblemReleaseTime"),
    problemReleaseAt: getProblemReleaseAt(),
    problemCloseAt: getProblemCloseAt(),
    selectionState: getParticipantSelectionState(),
    problemsReleased: isProblemReleased()
  };
}


function getAdminConfiguration() {
  return {
    registrationEnabled: getConfigValue("REGISTRATION_ENABLED"),
    registrationDeadline: getConfigValue("REGISTRATION_DEADLINE"),
    problemReleaseDate: getConfigValue("ProblemReleaseDate"),
    problemReleaseTime: getConfigValue("ProblemReleaseTime"),
    problemReleaseAt: getProblemReleaseAt(),
    problemCloseAt: getProblemCloseAt(),
    selectionStatus: String(getConfigValue("SelectionStatus") || "").trim().toUpperCase(),
    selectionState: getParticipantSelectionState(),
    allowSelectionReset: isSelectionResetAllowed(),
    problemReleaseOverride: String(getConfigValue("ProblemReleaseOverride") || "").trim().toUpperCase() === "TRUE"
  };
}


function adminUpdateConfiguration(data) {
  const dataObj = data || {};

  // Handle ALLOW_SELECTION_RESET independently — does not require release/close dates.
  if (dataObj.allowSelectionReset !== undefined && Object.keys(dataObj).length === 1) {
    return adminSetAllowSelectionReset(dataObj.allowSelectionReset ? "TRUE" : "FALSE");
  }

  // If only updating registration fields and/or selectionStatus without touching dates.
  const touchingDates = dataObj.problemReleaseAt ||
    (dataObj.problemReleaseDate && dataObj.problemReleaseTime) ||
    dataObj.problemCloseAt || dataObj.problemCloseDateTime;

  if (!touchingDates) {
    // Non-datetime fields only.
    if (dataObj.registrationEnabled !== undefined) {
      setConfigValue("REGISTRATION_ENABLED", dataObj.registrationEnabled);
    }
    if (dataObj.registrationDeadline !== undefined) {
      setConfigValue("REGISTRATION_DEADLINE", dataObj.registrationDeadline);
    }
    if (dataObj.selectionStatus !== undefined) {
      setConfigValue("SelectionStatus", dataObj.selectionStatus);
    }
    if (dataObj.allowSelectionReset !== undefined) {
      setConfigValue("ALLOW_SELECTION_RESET", dataObj.allowSelectionReset ? "TRUE" : "FALSE");
    }
    if (dataObj.problemReleaseOverride !== undefined) {
      setConfigValue("ProblemReleaseOverride", dataObj.problemReleaseOverride ? "TRUE" : "FALSE");
    }
    return getAdminConfiguration();
  }

  // Full datetime update path.
  let releaseAt = null;
  let closeAt = null;

  if (dataObj.problemReleaseAt) {
    releaseAt = new Date(String(dataObj.problemReleaseAt));
  } else if (dataObj.problemReleaseDate && dataObj.problemReleaseTime) {
    releaseAt = parseConfiguredDateTime(dataObj.problemReleaseDate, dataObj.problemReleaseTime);
  } else {
    releaseAt = getProblemReleaseAt();
  }

  if (dataObj.problemCloseAt || dataObj.problemCloseDateTime) {
    closeAt = new Date(String(dataObj.problemCloseAt || dataObj.problemCloseDateTime));
  } else {
    closeAt = getProblemCloseAt();
  }

  if (!releaseAt || isNaN(releaseAt.getTime()) || !closeAt || isNaN(closeAt.getTime())) {
    throwApiError("Valid release and close timestamps are required.", "INVALID_CONFIGURATION");
  }

  if (closeAt.getTime() <= releaseAt.getTime()) {
    throwApiError("Problem close time must be after release time.", "INVALID_CONFIGURATION");
  }

  const dateStr = Utilities.formatDate(releaseAt, APP_TIME_ZONE, "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(releaseAt, APP_TIME_ZONE, "HH:mm:ss");

  setConfigValue("ProblemReleaseDate", dateStr);
  setConfigValue("ProblemReleaseTime", timeStr);
  setConfigValue("PROBLEM_CLOSE_DATETIME", closeAt.toISOString());

  if (dataObj.registrationEnabled !== undefined) {
    setConfigValue("REGISTRATION_ENABLED", dataObj.registrationEnabled);
  }
  if (dataObj.registrationDeadline !== undefined) {
    setConfigValue("REGISTRATION_DEADLINE", dataObj.registrationDeadline);
  }
  if (dataObj.selectionStatus !== undefined) {
    setConfigValue("SelectionStatus", dataObj.selectionStatus);
  }
  if (dataObj.allowSelectionReset !== undefined) {
    setConfigValue("ALLOW_SELECTION_RESET", dataObj.allowSelectionReset ? "TRUE" : "FALSE");
  }

  return getAdminConfiguration();
}


function adminReleaseNow() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setConfigValue("ProblemReleaseOverride", "TRUE");
    return { success: true, data: { problemsReleased: true } };
  } finally {
    lock.releaseLock();
  }
}


function adminSetSelectionStatus(status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setConfigValue("SelectionStatus", status);
    return { success: true, data: { selectionStatus: status } };
  } finally {
    lock.releaseLock();
  }
}


function adminSetAllowSelectionReset(flag) {
  const normalized = String(flag || "").trim().toUpperCase();

  if (normalized !== "TRUE" && normalized !== "FALSE") {
    throwApiError("ALLOW_SELECTION_RESET must be TRUE or FALSE.", "INVALID_CONFIGURATION");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setConfigValue("ALLOW_SELECTION_RESET", normalized);
    return { success: true, data: { allowSelectionReset: normalized === "TRUE" } };
  } finally {
    lock.releaseLock();
  }
}


function adminRemoveTeamSelection(teamId) {
  requireSelectionResetAllowed();

  const normalizedTeamId = String(teamId || "").trim();

  if (!normalizedTeamId) {
    throwApiError("TeamID is required.", "INVALID_REQUEST");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    requireSelectionResetAllowed();

    const team = getSheetRecords(SHEET_NAMES.TEAMS).find(function(t) {
      const sTeamId = String(t.TeamID || t.teamId || t["Team ID"] || "").trim();
      return sTeamId === normalizedTeamId;
    });

    if (!team) {
      throwApiError("The requested team was not found.", "TEAM_NOT_FOUND");
    }

    const sheet = getSheet(SHEET_NAMES.SELECTIONS);
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return { success: true, data: { teamId: normalizedTeamId, removed: 0 } };
    }

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const teamIdIdx = headers.findIndex(function(h) { return normalizeHeaderKey(h) === "TEAMID"; });
    const statusIdx = headers.findIndex(function(h) { return normalizeHeaderKey(h) === "STATUS"; });

    if (teamIdIdx < 0 || statusIdx < 0) {
      throwApiError("Selections sheet is missing required headers.", "INTERNAL_ERROR");
    }

    const rowsToDelete = [];

    for (let i = 1; i < values.length; i++) {
      if (
        String(values[i][teamIdIdx]).trim() === normalizedTeamId &&
        String(values[i][statusIdx]).trim().toUpperCase() === SELECTION_STATUS.LOCKED
      ) {
        rowsToDelete.push(i + 1);
      }
    }

    // Delete in reverse order so row numbers stay correct.
    rowsToDelete.reverse().forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      data: {
        teamId: normalizedTeamId,
        removed: rowsToDelete.length
      }
    };
  } finally {
    lock.releaseLock();
  }
}


function adminRemoveSelectionByPsid(psId) {
  requireSelectionResetAllowed();

  const normalizedPsId = String(psId || "").trim().toUpperCase();

  if (!normalizedPsId) {
    throwApiError("PSID is required.", "INVALID_REQUEST");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    requireSelectionResetAllowed();

    const sheet = getSheet(SHEET_NAMES.SELECTIONS);
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return { success: true, data: { psId: normalizedPsId, removed: 0 } };
    }

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const psIdIdx = headers.findIndex(function(h) { return normalizeHeaderKey(h) === "PSID"; });
    const statusIdx = headers.findIndex(function(h) { return normalizeHeaderKey(h) === "STATUS"; });

    if (psIdIdx < 0 || statusIdx < 0) {
      throwApiError("Selections sheet is missing required headers.", "INTERNAL_ERROR");
    }

    const rowsToDelete = [];

    for (let i = 1; i < values.length; i++) {
      if (
        String(values[i][psIdIdx]).trim().toUpperCase() === normalizedPsId &&
        String(values[i][statusIdx]).trim().toUpperCase() === SELECTION_STATUS.LOCKED
      ) {
        rowsToDelete.push(i + 1);
      }
    }

    rowsToDelete.reverse().forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      data: {
        psId: normalizedPsId,
        removed: rowsToDelete.length
      }
    };
  } finally {
    lock.releaseLock();
  }
}


function adminRemoveAllSelections() {
  requireSelectionResetAllowed();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    requireSelectionResetAllowed();

    const sheet = getSheet(SHEET_NAMES.SELECTIONS);
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return { success: true, data: { removed: 0 } };
    }

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const statusIdx = headers.findIndex(function(h) { return normalizeHeaderKey(h) === "STATUS"; });

    if (statusIdx < 0) {
      throwApiError("Selections sheet is missing Status header.", "INTERNAL_ERROR");
    }

    const rowsToDelete = [];

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][statusIdx]).trim().toUpperCase() === SELECTION_STATUS.LOCKED) {
        rowsToDelete.push(i + 1);
      }
    }

    // Delete in reverse order.
    rowsToDelete.reverse().forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      data: {
        removed: rowsToDelete.length
      }
    };
  } finally {
    lock.releaseLock();
  }
}


function getAdminAllData() {
  const allTeamsRecords = getSheetRecords(SHEET_NAMES.TEAMS);
  const allProblemsRecords = getSheetRecords(SHEET_NAMES.PROBLEMS);
  const allDomainsRecords = getSheetRecords(SHEET_NAMES.DOMAINS);
  const allSelectionsRecords = getSheetRecords(SHEET_NAMES.SELECTIONS);

  // 1. Process Selections
  const selections = allSelectionsRecords.filter(function(selection) {
    return String(selection.Status || "").trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }).map(function(selection) {
    const teamId = String(selection.TeamID || selection.teamId || selection["Team ID"] || "").trim();
    const domainId = String(selection.DomainID || "").trim().toUpperCase();
    const psId = String(selection.PSID || "").trim().toUpperCase();
    const team = allTeamsRecords.find(function(t) { return String(t.TeamID || t.teamId || "").trim() === teamId; });
    const domain = allDomainsRecords.find(function(d) { return String(d.DomainID || "").trim().toUpperCase() === domainId; });
    const problem = allProblemsRecords.find(function(p) { return String(p.PSID || "").trim().toUpperCase() === psId; });
    const selectedAt = selection.SelectedAt instanceof Date
      ? selection.SelectedAt.toISOString()
      : String(selection.SelectedAt || "").trim();

    return {
      teamId: teamId,
      teamName: team ? String(team.TeamName || "").trim() : teamId,
      domainId: domainId,
      domainName: domain ? String(domain.DomainName || "").trim() : domainId,
      psId: psId,
      problemTitle: problem ? String(problem.Title || "").trim() : psId,
      selectedAt: selectedAt,
      status: String(selection.Status || "").trim().toUpperCase()
    };
  });

  const lockedTeamMap = {};
  selections.forEach(function(sel) {
    if (sel.teamId && sel.teamId !== "undefined") {
      lockedTeamMap[sel.teamId] = sel;
    }
  });

  const lockedDomainCount = {};
  selections.forEach(function(sel) {
    if (sel.domainId) {
      lockedDomainCount[sel.domainId] = (lockedDomainCount[sel.domainId] || 0) + 1;
    }
  });

  // 2. Process Teams
  const teams = allTeamsRecords.map(function(team) {
    const teamId = String(team.TeamID || team.teamId || team["Team ID"] || "").trim();
    const members = [];
    for (let i = 1; i <= 4; i++) {
      const name = String(team["Member" + i + "Name"] || "").trim();
      const reg = String(team["Member" + i + "RegisterNumber"] || "").trim();
      const dept = String(team["Member" + i + "Department"] || "").trim();
      if (name || reg || dept) {
        members.push({ name: name, registerNumber: reg, department: dept });
      }
    }
    const domainId = String(team.DomainID || "").trim().toUpperCase();
    const domain = allDomainsRecords.find(function(d) { return String(d.DomainID || "").trim().toUpperCase() === domainId; });
    const createdAt = team.CreatedAt instanceof Date
      ? team.CreatedAt.toISOString()
      : String(team.CreatedAt || "").trim();

    return {
      TeamID: teamId,
      teamId: teamId,
      TeamName: String(team.TeamName || "").trim(),
      teamName: String(team.TeamName || "").trim(),
      LeaderName: String(team.LeaderName || "").trim(),
      leaderName: String(team.LeaderName || "").trim(),
      LeaderEmail: normalizeEmail(team.LeaderEmail),
      leaderEmail: normalizeEmail(team.LeaderEmail),
      LeaderMobile: String(team.LeaderMobileNumber || team.LeaderMobile || "").trim(),
      leaderMobile: String(team.LeaderMobileNumber || team.LeaderMobile || "").trim(),
      LeaderRegisterNumber: normalizeRegisterNumber(team.LeaderRegisterNumber),
      leaderRegisterNumber: normalizeRegisterNumber(team.LeaderRegisterNumber),
      LeaderDepartment: String(team.LeaderDepartment || "").trim(),
      leaderDepartment: String(team.LeaderDepartment || "").trim(),
      DomainID: domainId,
      domainId: domainId,
      DomainName: domain ? String(domain.DomainName || "").trim() : domainId,
      domainName: domain ? String(domain.DomainName || "").trim() : domainId,
      Status: String(team.Status || "").trim().toUpperCase(),
      status: String(team.Status || "").trim().toUpperCase(),
      CreatedAt: createdAt,
      createdAt: createdAt,
      Members: members,
      members: members,
      Selection: lockedTeamMap[teamId] || null,
      selection: lockedTeamMap[teamId] || null
    };
  });

  // 3. Process Problems
  const problems = allProblemsRecords.map(function(problem) {
    return {
      PSID: String(problem.PSID).trim(),
      psId: String(problem.PSID).trim(),
      DomainID: String(problem.DomainID).trim().toUpperCase(),
      domainId: String(problem.DomainID).trim().toUpperCase(),
      Title: String(problem.Title || "").trim(),
      title: String(problem.Title || "").trim(),
      Description: String(problem.Description || "").trim(),
      description: String(problem.Description || "").trim(),
      WhatToBuild: String(problem.WhatToBuild || "").trim(),
      whatToBuild: String(problem.WhatToBuild || "").trim(),
      Status: String(problem.Status || "").trim().toUpperCase(),
      status: String(problem.Status || "").trim().toUpperCase()
    };
  });

  // 4. Process Domains
  const registeredTeamCount = {};
  teams.forEach(function(t) {
    if (t.status === TEAM_STATUS.ACTIVE && t.domainId) {
      registeredTeamCount[t.domainId] = (registeredTeamCount[t.domainId] || 0) + 1;
    }
  });

  const domains = allDomainsRecords.map(function(domain) {
    const domainId = String(domain.DomainID).trim().toUpperCase();
    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const lockedTeams = lockedDomainCount[domainId] || 0;
    const registeredTeams = registeredTeamCount[domainId] || 0;
    const status = String(domain.Status || "").trim().toUpperCase();

    return {
      DomainID: domainId,
      domainId: domainId,
      DomainName: String(domain.DomainName || "").trim(),
      domainName: String(domain.DomainName || "").trim(),
      MaximumTeams: maximumTeams,
      maximumTeams: maximumTeams,
      Status: status,
      status: status,
      RegisteredTeams: registeredTeams,
      registeredTeams: registeredTeams,
      LockedTeams: lockedTeams,
      lockedTeams: lockedTeams,
      CurrentLockedTeams: lockedTeams,
      currentLockedTeams: lockedTeams,
      RemainingCapacity: Math.max(maximumTeams - lockedTeams, 0),
      remainingCapacity: Math.max(maximumTeams - lockedTeams, 0),
      Available: status === DOMAIN_STATUS.ACTIVE && lockedTeams < maximumTeams,
      available: status === DOMAIN_STATUS.ACTIVE && lockedTeams < maximumTeams
    };
  });

  // 5. Config
  const config = getAdminConfiguration();

  // 6. Stats
  const activeTeamsCount = teams.filter(function(t) { return t.status === TEAM_STATUS.ACTIVE; }).length;
  const disabledTeamsCount = teams.filter(function(t) { return t.status === TEAM_STATUS.DISABLED; }).length;
  const lockedTeamSet = new Set(selections.map(function(s) { return s.teamId; }));
  const pendingTeamsCount = Math.max(activeTeamsCount - lockedTeamSet.size, 0);

  const totalProbs = problems.length;
  const activeProbs = problems.filter(function(p) { return p.status === PROBLEM_STATUS.ACTIVE; }).length;
  const disabledProbs = problems.filter(function(p) { return p.status === PROBLEM_STATUS.DISABLED; }).length;
  const lockedPsIds = new Set(selections.map(function(s) { return s.psId; }));
  const availProbs = problems.filter(function(p) { return p.status === PROBLEM_STATUS.ACTIVE && !lockedPsIds.has(p.psId); }).length;

  const stats = {
    registeredTeams: teams.length,
    activeTeams: activeTeamsCount,
    disabledTeams: disabledTeamsCount,
    pendingTeams: pendingTeamsCount,
    lockedSelections: selections.length,
    totalProblems: totalProbs,
    activeProblems: activeProbs,
    disabledProblems: disabledProbs,
    availableProblems: availProbs,
    totalActiveDomains: domains.filter(function(d) { return d.status === DOMAIN_STATUS.ACTIVE; }).length,
    domains: domains,
    selectionStatus: config.selectionStatus,
    selectionState: config.selectionState,
    problemReleaseAt: config.problemReleaseAt,
    problemCloseAt: config.problemCloseAt
  };

  return {
    stats: stats,
    teams: teams,
    problems: problems,
    domains: domains,
    config: config,
    selections: selections
  };
}