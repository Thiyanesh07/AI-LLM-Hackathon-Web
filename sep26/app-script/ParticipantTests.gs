function assertParticipantTest(condition, message) {
  if (!condition) {
    throw new Error("Participant test failed: " + message);
  }
}


function testActiveDomainRetrieval() {
  const domains = getActiveDomains();

  assertParticipantTest(Array.isArray(domains), "active domains should be an array");
  domains.forEach(function(domain) {
    assertParticipantTest(
      String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE,
      "disabled domain was returned"
    );
  });

  return domains;
}


function testDisabledDomainIsExcluded() {
  const allDomains = getSheetRecords(SHEET_NAMES.DOMAINS);
  const disabledDomain = allDomains.find(function(domain) {
    return String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.DISABLED;
  });

  if (!disabledDomain) {
    return { skipped: true, reason: "No disabled domain fixture exists." };
  }

  const activeDomainIds = getActiveDomains().map(function(domain) {
    return String(domain.DomainID).trim().toUpperCase();
  });

  assertParticipantTest(
    !activeDomainIds.includes(String(disabledDomain.DomainID).trim().toUpperCase()),
    "disabled domain was returned"
  );

  return { skipped: false };
}


function testDomainCapacityCalculation() {
  return getActiveDomains().map(function(domain) {
    const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
    const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);
    const participantDomain = getParticipantDomainsForTest(domain);

    assertParticipantTest(
      participantDomain.currentLockedTeams === currentLockedTeams,
      "locked team count is incorrect"
    );
    assertParticipantTest(
      participantDomain.remainingCapacity === Math.max(maximumTeams - currentLockedTeams, 0),
      "remaining capacity is incorrect"
    );

    return participantDomain;
  });
}


function getParticipantDomainsForTest(domain) {
  const maximumTeams = parsePositiveInteger(domain.MaximumTeams);
  const currentLockedTeams = getLockedSelectionCountByDomain(domain.DomainID);

  return {
    domainId: String(domain.DomainID).trim().toUpperCase(),
    maximumTeams: maximumTeams,
    currentLockedTeams: currentLockedTeams,
    remainingCapacity: Math.max(maximumTeams - currentLockedTeams, 0),
    available: Math.max(maximumTeams - currentLockedTeams, 0) > 0
  };
}


function testConfiguredReleaseDateParsing() {
  const dateObject = new Date(2026, 8, 9);
  const parsedObjectDate = parseConfiguredDateTime(dateObject, "10:30");
  const parsedStringDate = parseConfiguredDateTime("2026-09-09", "10:30:00");

  assertParticipantTest(parsedObjectDate instanceof Date, "Date object was not parsed");
  assertParticipantTest(parsedStringDate instanceof Date, "ISO date string was not parsed");

  return {
    dateObject: parsedObjectDate,
    stringDate: parsedStringDate
  };
}


function testAvailableProblemsAfterRelease(domainId) {
  assertParticipantTest(isProblemReleased(), "problem release has not arrived");
  assertParticipantTest(isSelectionOpen(), "selection is closed");

  const domain = getDomainById(domainId);
  assertParticipantTest(domain !== null, "test domain does not exist");
  assertParticipantTest(
    String(domain.Status).trim().toUpperCase() === DOMAIN_STATUS.ACTIVE,
    "test domain is disabled"
  );

  return getAvailableProblemsByDomain(domainId);
}


function testProblemRetrievalBeforeRelease() {
  const releaseDate = getConfigValue("ProblemReleaseDate");
  const releaseTime = getConfigValue("ProblemReleaseTime");
  const releaseAt = parseConfiguredDateTime(releaseDate, releaseTime);

  assertParticipantTest(releaseAt !== null, "release configuration is invalid");

  if (isProblemReleased()) {
    return { skipped: true, reason: "Configured release has already arrived." };
  }

  return { skipped: false, problemsReleased: isProblemReleased() };
}


function testDisabledProblemIsExcluded(domainId) {
  const disabledProblem = getProblemsByDomain(domainId).find(function(problem) {
    return String(problem.Status).trim().toUpperCase() === PROBLEM_STATUS.DISABLED;
  });

  if (!disabledProblem) {
    return { skipped: true, reason: "No disabled problem fixture exists." };
  }

  assertParticipantTest(
    !getAvailableProblemsByDomain(domainId).some(function(problem) {
      return problem.PSID === String(disabledProblem.PSID).trim();
    }),
    "disabled problem was returned"
  );

  return { skipped: false };
}


function testLockedProblemIsExcluded(domainId) {
  const lockedSelection = getSheetRecords(SHEET_NAMES.SELECTIONS).find(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  });

  if (!lockedSelection) {
    return { skipped: true, reason: "No locked selection fixture exists." };
  }

  const lockedProblem = getProblemById(lockedSelection.PSID);

  if (!lockedProblem || String(lockedProblem.DomainID).trim().toUpperCase() !== String(domainId).trim().toUpperCase()) {
    return { skipped: true, reason: "No locked problem fixture exists in the requested domain." };
  }

  assertParticipantTest(isProblemLocked(lockedProblem.PSID), "locked helper returned false");
  assertParticipantTest(
    !getAvailableProblemsByDomain(domainId).some(function(problem) {
      return problem.PSID === String(lockedProblem.PSID).trim();
    }),
    "locked problem was returned"
  );

  return { skipped: false };
}


function testProblemDomainFiltering(domainId, otherDomainId) {
  const problems = getProblemsByDomain(domainId);
  const otherDomainProblems = getProblemsByDomain(otherDomainId);

  assertParticipantTest(
    problems.every(function(problem) {
      return String(problem.DomainID).trim().toUpperCase() === String(domainId).trim().toUpperCase();
    }),
    "problem from another domain was returned"
  );
  assertParticipantTest(
    otherDomainProblems.every(function(problem) {
      return String(problem.DomainID).trim().toUpperCase() !== String(domainId).trim().toUpperCase();
    }),
    "domain filtering fixture is invalid"
  );

  return problems;
}


function testUnauthenticatedParticipantRequest() {
  const response = doPost({
    postData: {
      contents: JSON.stringify({ action: "GET_DOMAINS" })
    }
  });
  const result = JSON.parse(response.getContent());

  assertParticipantTest(result.success === false, "unauthenticated request succeeded");
  assertParticipantTest(result.code === "AUTH_REQUIRED", "wrong unauthenticated error code");

  return result;
}


function testDisabledTeamRejected(idToken) {
  try {
    requireTeamLeader(idToken);
    throw new Error("Participant test failed: disabled team was accepted");
  } catch (error) {
    assertParticipantTest(error.code === "TEAM_DISABLED", "wrong disabled team error code");
    return error.code;
  }
}


function testNonexistentDomainRejected(idToken) {
  try {
    getParticipantProblems(idToken, { domainId: "DOES-NOT-EXIST" });
    throw new Error("Participant test failed: nonexistent domain was accepted");
  } catch (error) {
    assertParticipantTest(error.code === "DOMAIN_NOT_FOUND", "wrong nonexistent domain error code");
    return error.code;
  }
}


function testClosedSelectionPreventsProblemRetrieval(idToken, domainId) {
  if (isSelectionOpen()) {
    return { skipped: true, reason: "Selection is currently open." };
  }

  try {
    getParticipantProblems(idToken, { domainId: domainId });
    throw new Error("Participant test failed: closed selection was accepted");
  } catch (error) {
    assertParticipantTest(error.code === "SELECTION_CLOSED", "wrong closed selection error code");
    return { skipped: false, code: error.code };
  }
}


function testRegistrationOpenBeforeDeadline() {
  const futureDeadline = new Date(Date.now() + 86400000).toISOString();
  setConfigValue("REGISTRATION_ENABLED", "TRUE");
  setConfigValue("REGISTRATION_DEADLINE", futureDeadline);

  assertParticipantTest(isRegistrationOpen() === true, "registration should be open before deadline");
  return { success: true };
}


function testRegistrationClosedAfterDeadline() {
  const pastDeadline = new Date(Date.now() - 86400000).toISOString();
  setConfigValue("REGISTRATION_ENABLED", "TRUE");
  setConfigValue("REGISTRATION_DEADLINE", pastDeadline);

  assertParticipantTest(isRegistrationOpen() === false, "registration should be closed after deadline");

  try {
    checkRegistrationOpen();
    throw new Error("checkRegistrationOpen should have thrown when deadline passed");
  } catch (error) {
    assertParticipantTest(error.code === "REGISTRATION_CLOSED", "wrong error code for past deadline");
  }

  return { success: true };
}


function testRegistrationDisabledSwitch() {
  setConfigValue("REGISTRATION_ENABLED", "FALSE");

  assertParticipantTest(isRegistrationOpen() === false, "registration should be closed when disabled");

  try {
    checkRegistrationOpen();
    throw new Error("checkRegistrationOpen should have thrown when disabled");
  } catch (error) {
    assertParticipantTest(error.code === "REGISTRATION_CLOSED", "wrong error code when disabled");
  }

  return { success: true };
}


function testClosedRegistrationRejectsTeamCreation() {
  setConfigValue("REGISTRATION_ENABLED", "FALSE");

  const dummyTeamData = {
    teamName: "Closed Test Team",
    leaderName: "Test Leader",
    leaderEmail: "testclosed@bitsathy.ac.in",
    leaderMobile: "9876543210",
    leaderRegisterNumber: "CLOSED001",
    leaderDepartment: "CSE",
    domainId: "AGR",
    members: [{ name: "Member 1", registerNumber: "CLOSED002", department: "CSE" }]
  };

  try {
    createTeam(dummyTeamData);
    throw new Error("createTeam should have been rejected when registration is closed");
  } catch (error) {
    assertParticipantTest(error.code === "REGISTRATION_CLOSED", "wrong error code on createTeam when closed");
    assertParticipantTest(error.message === "Registration has closed.", "wrong error message on createTeam when closed");
  }

  return { success: true };
}

