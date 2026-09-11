function generateNextTeamId() {
  const lock = LockService.getScriptLock();

  // Wait up to 10 seconds if another registration is running.
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.TEAMS);
    const lastRow = sheet.getLastRow();

    // Only headers exist → first team.
    if (lastRow < 2) {
      return TEAM_ID_PREFIX + "001";
    }

    const headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
    const teamIdCol = headerMap.TeamID || 1;

    // Read the TeamID column only.
    const teamIds = sheet
      .getRange(2, teamIdCol, lastRow - 1, 1)
      .getValues()
      .flat();

    let maxNumber = 0;

    teamIds.forEach(function (teamId) {
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

    const nextNumber = maxNumber + 1;

    return TEAM_ID_PREFIX + String(nextNumber).padStart(3, "0");

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
      TeamID: teamId,
      TeamName: String(data.teamName || "").trim(),
      LeaderName: String(data.leaderName || "").trim(),
      LeaderEmail: normalizeEmail(data.leaderEmail),
      LeaderMobileNumber: normalizedMobile,
      LeaderMobile: normalizedMobile,
      LeaderRegisterNumber: normalizeRegisterNumber(data.leaderRegisterNumber),
      LeaderDepartment: String(data.leaderDepartment || "").trim(),
      Member1Name: String(member1.name || "").trim(),
      Member1RegisterNumber: normalizeRegisterNumber(member1.registerNumber),
      Member1Department: String(member1.department || "").trim(),
      Member2Name: String(member2.name || "").trim(),
      Member2RegisterNumber: normalizeRegisterNumber(member2.registerNumber),
      Member2Department: String(member2.department || "").trim(),
      Member3Name: String(member3.name || "").trim(),
      Member3RegisterNumber: normalizeRegisterNumber(member3.registerNumber),
      Member3Department: String(member3.department || "").trim(),
      Member4Name: String(member4.name || "").trim(),
      Member4RegisterNumber: normalizeRegisterNumber(member4.registerNumber),
      Member4Department: String(member4.department || "").trim(),
      Status: TEAM_STATUS.ACTIVE,
      CreatedAt: new Date(),
      DomainID: domainId
    };

    const rowToAppend = headers.map(function(header) {
      if (Object.prototype.hasOwnProperty.call(fieldMap, header)) {
        return fieldMap[header];
      }
      return "";
    });

    Logger.log("ROW_WRITE_START: Appending row to Teams sheet for " + teamId);
    sheet.appendRow(rowToAppend);
    const insertedRowIndex = sheet.getLastRow();
    Logger.log("ROW_WRITE_SUCCESS: Row appended at index " + insertedRowIndex);

    // Verify written row directly
    const teamIdCol = headerMap.TeamID || 1;
    const writtenTeamId = String(sheet.getRange(insertedRowIndex, teamIdCol).getValue()).trim();

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

  const headerMap = getSheetHeaderMap(SHEET_NAMES.TEAMS);
  const teamIdCol = headerMap.TeamID || 1;

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

    const number = parseInt(value.substring(TEAM_ID_PREFIX.length), 10);

    if (!isNaN(number)) {
      maxNumber = Math.max(maxNumber, number);
    }
  });

  return TEAM_ID_PREFIX + String(maxNumber + 1).padStart(3, "0");
}