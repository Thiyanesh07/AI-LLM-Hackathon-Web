function getTeamIdColumn(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throwApiError("Teams sheet has no columns.", "TEAM_ID_COLUMN_MAPPING_FAILED");
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0];

  const matches = [];
  headers.forEach(function(header, index) {
    if (normalizeHeaderKey(header) === "TEAMID") {
      matches.push(index + 1);
    }
  });

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throwApiError(
      "Duplicate normalized Team ID headers found in Teams sheet: " + JSON.stringify(headers),
      "DUPLICATE_TEAM_ID_HEADERS"
    );
  }

  // Fallback: If no explicit Team ID header exists, but column 1 (A1) is empty/unlabelled (""),
  // column 1 (Column A) is the target Team ID column.
  const firstHeaderNorm = normalizeHeaderKey(headers[0]);
  if (!firstHeaderNorm) {
    Logger.log("TEAM_ID_COLUMN_RESOLVED: Header at column 1 is empty ('" + headers[0] + "'). Defaulting Team ID to Column 1.");
    return 1;
  }

  throwApiError(
    "Failed to map Team ID to target row column. Headers: " + JSON.stringify(headers),
    "TEAM_ID_COLUMN_MAPPING_FAILED"
  );
}


function generateNextTeamId() {
  const lock = LockService.getScriptLock();

  // Wait up to 10 seconds if another registration is running.
  lock.waitLock(10000);

  try {
    return generateNextTeamIdWithoutLock();
  } finally {
    lock.releaseLock();
  }
}


function normalizeAndValidateMobile(mobileInput) {
  const text = String(mobileInput || "").trim();
  if (!text) {
    throwApiError("Leader mobile number is required.", "INVALID_MOBILE_NUMBER");
  }

  let cleaned = text.replace(/[\s\-\(\)]/g, "");

  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    throwApiError(
      "Leader mobile number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
      "INVALID_MOBILE_NUMBER"
    );
  }

  return cleaned;
}


function validateTeamRegistration(data) {
  if (!data) {
    throw new Error("Registration data is required.");
  }

  // -----------------------------
  // Team name
  // -----------------------------
  const teamName = String(data.teamName || "").trim();

  if (!teamName) {
    throw new Error("Team name is required.");
  }

  // -----------------------------
  // Leader details
  // -----------------------------
  const leaderName = String(data.leaderName || "").trim();

  if (!leaderName) {
    throw new Error("Leader name is required.");
  }

  normalizeAndValidateMobile(data.leaderMobile);

  const leaderEmail = normalizeEmail(data.leaderEmail);

  if (!leaderEmail) {
    throw new Error("Leader email is required.");
  }

  if (!leaderEmail.endsWith(COLLEGE_EMAIL_DOMAIN)) {
    throw new Error("Only @bitsathy.ac.in email addresses are allowed.");
  }

  const leaderRegisterNumber =
    normalizeRegisterNumber(data.leaderRegisterNumber);

  if (!leaderRegisterNumber) {
    throw new Error("Leader register number is required.");
  }

  const leaderDepartment =
    String(data.leaderDepartment || "").trim();

  if (!leaderDepartment) {
    throw new Error("Leader department is required.");
  }

  // -----------------------------
  // Member details
  // -----------------------------
  const members = data.members || [];

  if (!Array.isArray(members)) {
    throw new Error("Members must be provided as an array.");
  }

  if (members.length < 1 || members.length > 3) {
    throw new Error("A team must have between 2 and 4 members including the leader.");
  }

  // -----------------------------
  // Validate each member
  // -----------------------------
  members.forEach(function (member, index) {

    const memberNumber = index + 1;

    if (!member) {
      throw new Error(`Member ${memberNumber} data is invalid.`);
    }

    const name = String(member.name || "").trim();

    const registerNumber =
      normalizeRegisterNumber(member.registerNumber);

    const department =
      String(member.department || "").trim();

    if (!name) {
      throw new Error(`Member ${memberNumber} name is required.`);
    }

    if (!registerNumber) {
      throw new Error(
        `Member ${memberNumber} register number is required.`
      );
    }

    if (!department) {
      throw new Error(
        `Member ${memberNumber} department is required.`
      );
    }
  });

  return true;
}


function checkDuplicateTeamRegistration(data) {
  const leaderEmail = normalizeEmail(data.leaderEmail);
  const leaderRegisterNumber =
    normalizeRegisterNumber(data.leaderRegisterNumber);

  const submittedRegisterNumbers = [
    leaderRegisterNumber
  ];

  // Add member register numbers.
  (data.members || []).forEach(function(member) {
    const registerNumber =
      normalizeRegisterNumber(member.registerNumber);
    if (registerNumber) {
      submittedRegisterNumbers.push(registerNumber);
    }
  });

  // --------------------------------
  // Check duplicates within submission
  // --------------------------------
  const uniqueRegisterNumbers = new Set(submittedRegisterNumbers);

  if (uniqueRegisterNumbers.size !== submittedRegisterNumbers.length) {
    throwApiError(
      "The same register number cannot appear more than once in a team.",
      "DUPLICATE_REGISTER_NUMBER"
    );
  }

  // --------------------------------
  // Check existing teams using header records
  // --------------------------------
  const existingTeams = getSheetRecords(SHEET_NAMES.TEAMS);

  for (let i = 0; i < existingTeams.length; i++) {
    const team = existingTeams[i];
    const existingLeaderEmail = normalizeEmail(team.LeaderEmail);

    const existingRegisterNumbers = [
      normalizeRegisterNumber(team.LeaderRegisterNumber),
      normalizeRegisterNumber(team.Member1RegisterNumber),
      normalizeRegisterNumber(team.Member2RegisterNumber),
      normalizeRegisterNumber(team.Member3RegisterNumber),
      normalizeRegisterNumber(team.Member4RegisterNumber)
    ].filter(Boolean);

    // Check leader email.
    if (leaderEmail && existingLeaderEmail === leaderEmail) {
      Logger.log("REGISTRATION_FAILURE: Duplicate leader email " + leaderEmail);
      throwApiError(
        "This team leader email is already registered.",
        "TEAM_ALREADY_REGISTERED"
      );
    }

    // Check register numbers.
    for (let j = 0; j < submittedRegisterNumbers.length; j++) {
      const submittedNumber = submittedRegisterNumbers[j];
      if (submittedNumber && existingRegisterNumbers.includes(submittedNumber)) {
        Logger.log("REGISTRATION_FAILURE: Duplicate register number " + submittedNumber);
        throwApiError(
          `Register number ${submittedNumber} is already registered in another team.`,
          "DUPLICATE_REGISTER_NUMBER"
        );
      }
    }
  }

  return {
    duplicate: false
  };
}


function createTeam(data) {
  Logger.log("REGISTRATION_START: Processing createTeam execution.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    checkRegistrationOpen();

    try {
      validateTeamRegistration(data);
    } catch (error) {
      if (error.code) {
        throw error;
      }
      throwApiError(error.message, "INVALID_TEAM_DATA");
    }

    const normalizedMobile = normalizeAndValidateMobile(data.leaderMobile);

    checkDuplicateTeamRegistration(data);
    Logger.log("DUPLICATES_VALIDATED: Duplicate check passed.");

    const domainId = String(data.domainId || data.DomainID || "").trim().toUpperCase();

    if (!domainId) {
      throwApiError("Domain selection is required for team registration.", "DOMAIN_REQUIRED");
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
    Logger.log("DOMAIN_VALIDATED: Domain " + domainId + " capacity check passed.");

    const teamId = generateNextTeamIdWithoutLock();
    if (!teamId || typeof teamId !== "string" || !teamId.trim() || !teamId.startsWith(TEAM_ID_PREFIX)) {
      Logger.log("REGISTRATION_FAILURE: Invalid or empty generated Team ID: " + teamId);
      throwApiError("Failed to generate a valid Team ID.", "TEAM_ID_GENERATION_FAILED");
    }
    Logger.log("TEAM_ID_GENERATED: " + teamId);

    const sheet = getSheet(SHEET_NAMES.TEAMS);
    const members = data.members || [];

    function getMember(index) {
      return members[index] || {};
    }

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

    const targetTeamIdCol = getTeamIdColumn(sheet);

    const rowToAppend = headers.map(function(header, index) {
      if (index + 1 === targetTeamIdCol) {
        return teamId;
      }
      const normalizedHeader = normalizeHeaderKey(header);
      if (Object.prototype.hasOwnProperty.call(fieldMap, normalizedHeader)) {
        return fieldMap[normalizedHeader];
      }
      return "";
    });

    if (rowToAppend.length !== lastColumn) {
      throwApiError("Row column count mismatch with sheet headers.", "ROW_LENGTH_MISMATCH");
    }

    if (!rowToAppend[targetTeamIdCol - 1] || String(rowToAppend[targetTeamIdCol - 1]).trim() !== teamId) {
      Logger.log("REGISTRATION_FAILURE: Pre-append invariant check failed for TeamID at col " + targetTeamIdCol);
      throwApiError("Failed to map Team ID to target row column.", "TEAM_ID_COLUMN_MAPPING_FAILED");
    }

    Logger.log("ROW_WRITE_START: Appending row to Teams sheet for " + teamId);
    sheet.appendRow(rowToAppend);
    SpreadsheetApp.flush();
    const insertedRowIndex = sheet.getLastRow();
    Logger.log("ROW_WRITE_SUCCESS: Row appended at index " + insertedRowIndex);

    // Verify written row directly
    const writtenTeamId = String(sheet.getRange(insertedRowIndex, targetTeamIdCol).getValue()).trim();

    if (writtenTeamId !== teamId) {
      Logger.log("REGISTRATION_FAILURE: Persistence verification failed. Expected " + teamId + ", got " + writtenTeamId);
      throwApiError("Team registration persistence verification failed.", "REGISTRATION_PERSISTENCE_FAILED");
    }

    Logger.log("REGISTRATION_SUCCESS: Team " + teamId + " successfully persisted in Google Sheets.");

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
    Logger.log("REGISTRATION_FAILURE: " + (err.message || err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}


function registerTeam(idToken, data) {
  Logger.log("REGISTRATION_START: Verifying Google ID token.");
  const user = requireAuthenticatedUser(idToken);
  Logger.log("AUTH_VERIFIED: Authenticated user email = " + user.email);

  const registration = data || {};

  if (registration.leaderEmail) {
    const submittedEmail = normalizeEmail(registration.leaderEmail);
    if (submittedEmail && submittedEmail !== user.email) {
      Logger.log("REGISTRATION_FAILURE: Submitted email " + submittedEmail + " != authenticated email " + user.email);
      throwApiError(
        "Submitted leader email does not match the authenticated Google account.",
        "LEADER_EMAIL_MISMATCH"
      );
    }
  }

  registration.leaderEmail = user.email;

  return createTeam(registration);
}


function getTeamById(teamId) {
  const normalizedTeamId = String(teamId || "").trim();
  const teams = getSheetRecords(SHEET_NAMES.TEAMS);

  for (let i = 0; i < teams.length; i++) {
    if (String(teams[i].TeamID).trim() === normalizedTeamId) {
      return teams[i];
    }
  }

  return null;
}


function generateNextTeamIdWithoutLock() {
  const sheet = getSheet(SHEET_NAMES.TEAMS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return TEAM_ID_PREFIX + "001";
  }

  const teamIdCol = getTeamIdColumn(sheet);

  const teamIds = sheet
    .getRange(2, teamIdCol, lastRow - 1, 1)
    .getValues()
    .flat();

  let maxNumber = 0;

  teamIds.forEach(function(teamId) {
    if (!teamId) {
      return;
    }

    const value = String(teamId).trim();

    if (!value.startsWith(TEAM_ID_PREFIX)) {
      return;
    }

    const numberPart = value.substring(TEAM_ID_PREFIX.length);
    const number = parseInt(numberPart, 10);

    if (!isNaN(number)) {
      maxNumber = Math.max(maxNumber, number);
    }
  });

  return TEAM_ID_PREFIX + String(maxNumber + 1).padStart(3, "0");
}