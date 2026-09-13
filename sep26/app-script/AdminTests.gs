function assertAdminTest(condition, message) {
  if (!condition) {
    throw new Error("Admin test failed: " + message);
  }
}


function testAdminMissingToken() {
  try {
    requireAdmin("");
    throw new Error("Admin test failed: missing token was accepted.");
  } catch (error) {
    assertAdminTest(error.code === "AUTH_REQUIRED", "wrong missing-token code");
    return error.code;
  }
}


function testAdminAuthorization(idToken) {
  return requireAdmin(idToken);
}


function testAdminStatistics() {
  const stats = getAdminDashboardStats();

  assertAdminTest(typeof stats.registeredTeams === "number", "team statistics are missing");
  assertAdminTest(typeof stats.totalProblems === "number", "problem statistics are missing");
  assertAdminTest(typeof stats.lockedSelections === "number", "selection statistics are missing");
  assertAdminTest(Array.isArray(stats.domains), "domain statistics are missing");

  return stats;
}


function testAdminTeamListing(status) {
  const teams = getAdminTeams(status ? { status: status } : {});

  assertAdminTest(Array.isArray(teams), "team listing is not an array");
  teams.forEach(function(team) {
    assertAdminTest(Boolean(team.TeamID), "team ID is missing");
    assertAdminTest(Array.isArray(team.Members), "team members are missing");
  });

  return teams;
}


function testAdminProblemListing() {
  const problems = getAdminProblems();

  assertAdminTest(Array.isArray(problems), "problem listing is not an array");
  problems.forEach(function(problem) {
    assertAdminTest(Boolean(problem.PSID), "problem ID is missing");
    assertAdminTest(Boolean(problem.Status), "problem status is missing");
  });

  return problems;
}


function testAdminDomainListing() {
  const domains = getAdminDomains();

  assertAdminTest(Array.isArray(domains), "domain listing is not an array");
  domains.forEach(function(domain) {
    assertAdminTest(typeof domain.CurrentLockedTeams === "number", "locked count is missing");
    assertAdminTest(typeof domain.RemainingCapacity === "number", "remaining capacity is missing");
  });

  return domains;
}


function testAdminAddTeam(idToken, data) {
  requireAdmin(idToken);
  return adminAddTeam(data);
}


function testAdminUpdateTeam(idToken, data) {
  requireAdmin(idToken);
  return adminUpdateTeam(data);
}


function testAdminEnableTeam(idToken, teamId) {
  requireAdmin(idToken);
  return adminEnableTeam(teamId);
}


function testAdminDisableTeam(idToken, teamId) {
  requireAdmin(idToken);
  return adminDisableTeam(teamId);
}


function testAdminAddProblem(idToken, data) {
  requireAdmin(idToken);
  return adminAddProblem(data);
}


function testAdminUpdateProblem(idToken, data) {
  requireAdmin(idToken);
  return adminUpdateProblem(data);
}


function testAdminEnableProblem(idToken, psId) {
  requireAdmin(idToken);
  return adminEnableProblem(psId);
}


function testAdminDisableProblem(idToken, psId) {
  requireAdmin(idToken);
  return adminDisableProblem(psId);
}


function testAdminUpdateDomain(idToken, data) {
  requireAdmin(idToken);
  return adminUpdateDomain(data);
}


function testAdminReleaseNow(idToken) {
  requireAdmin(idToken);
  const result = adminReleaseNow();
  assertAdminTest(isProblemReleased(), "release override did not take effect");
  return result;
}


function testAdminCloseSelection(idToken) {
  requireAdmin(idToken);
  const result = adminSetSelectionStatus("CLOSED");
  assertAdminTest(!isSelectionOpen(), "selection did not close");
  return result;
}


function testAdminOpenSelection(idToken) {
  requireAdmin(idToken);
  const result = adminSetSelectionStatus(SELECTION_STATUS.OPEN);
  assertAdminTest(isSelectionOpen(), "selection did not open");
  return result;
}


function testAdminCapacityLowerThanLocked(domainId, lowerCapacity) {
  const domain = getDomainById(domainId);
  const lockedCount = getLockedSelectionCountByDomain(domainId);

  assertAdminTest(domain !== null, "test domain does not exist");
  assertAdminTest(Number(lowerCapacity) < lockedCount, "test capacity is not below locked count");

  return {
    lockedCount: lockedCount,
    resultingAvailable: false
  };
}


function testAdminBypassRejected() {
  const response = doPost({
    postData: {
      contents: JSON.stringify({
        action: "ADMIN_GET_STATS",
        role: "ADMIN"
      })
    }
  });
  const result = JSON.parse(response.getContent());

  assertAdminTest(result.success === false, "client role bypass succeeded");
  assertAdminTest(result.code === "AUTH_REQUIRED", "wrong bypass rejection code");

  return result;
}


function testAllowSelectionResetEnforcement() {
  // Ensure ALLOW_SELECTION_RESET is FALSE (safe default).
  setConfigValue("ALLOW_SELECTION_RESET", "FALSE");

  try {
    requireSelectionResetAllowed();
    throw new Error("Admin test failed: reset was allowed when flag is FALSE.");
  } catch (error) {
    assertAdminTest(error.code === "RESET_NOT_ALLOWED", "wrong error code when reset disabled");
  }

  assertAdminTest(!isSelectionResetAllowed(), "isSelectionResetAllowed should be false");

  // Enable the flag.
  setConfigValue("ALLOW_SELECTION_RESET", "TRUE");
  assertAdminTest(isSelectionResetAllowed(), "isSelectionResetAllowed should be true after setting TRUE");

  // Restore safe default.
  setConfigValue("ALLOW_SELECTION_RESET", "FALSE");

  return { success: true };
}


function testAdminSetAllowResetToggle() {
  setConfigValue("ALLOW_SELECTION_RESET", "FALSE");
  const enableResult = adminSetAllowSelectionReset("TRUE");
  assertAdminTest(enableResult.data.allowSelectionReset === true, "enable toggle failed");
  assertAdminTest(isSelectionResetAllowed(), "flag not TRUE after enable");

  const disableResult = adminSetAllowSelectionReset("FALSE");
  assertAdminTest(disableResult.data.allowSelectionReset === false, "disable toggle failed");
  assertAdminTest(!isSelectionResetAllowed(), "flag not FALSE after disable");

  return { success: true };
}


function testAdminRemoveTeamSelectionBlockedWhenFlagFalse() {
  setConfigValue("ALLOW_SELECTION_RESET", "FALSE");

  try {
    adminRemoveTeamSelection("SOME-TEAM-ID");
    throw new Error("Admin test failed: removal succeeded when ALLOW_SELECTION_RESET is FALSE.");
  } catch (error) {
    assertAdminTest(error.code === "RESET_NOT_ALLOWED", "wrong error code for removal when flag false");
  }

  return { success: true };
}


function testAdminRemoveAllSelectionsBlockedWhenFlagFalse() {
  setConfigValue("ALLOW_SELECTION_RESET", "FALSE");

  try {
    adminRemoveAllSelections();
    throw new Error("Admin test failed: remove-all succeeded when ALLOW_SELECTION_RESET is FALSE.");
  } catch (error) {
    assertAdminTest(error.code === "RESET_NOT_ALLOWED", "wrong error code for remove-all when flag false");
  }

  return { success: true };
}


function testAdminConfigIncludesAllowSelectionReset() {
  const config = getAdminConfiguration();
  assertAdminTest(typeof config.allowSelectionReset === "boolean", "allowSelectionReset missing from config");
  return config;
}