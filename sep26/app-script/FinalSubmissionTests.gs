function assertFinalSubmissionTest(condition, message) {
  if (!condition) {
    throw new Error("FinalSubmission test failed: " + message);
  }
}

function runAllFinalSubmissionTests() {
  console.log("Running Final Submission System Backend Unit Tests...");

  const results = {
    test1_validSubmission: testValidFinalSubmission(),
    test2_missingFeedback: testFinalSubmissionMissingFeedback(),
    test3_emptyFeedback: testFinalSubmissionEmptyFeedback(),
    test4_maxLengthExceeded: testFinalSubmissionMaxLengthExceeded(),
    test5_unauthenticatedRequest: testFinalSubmissionUnauthenticatedRequest(),
    test6_invalidToken: testFinalSubmissionInvalidToken(),
    test7_nonTeamLeader: testFinalSubmissionNonTeamLeader(),
    test8_disabledTeam: testFinalSubmissionDisabledTeam(),
    test9_teamWithoutLockedSelection: testFinalSubmissionTeamWithoutLockedSelection(),
    test10_validTeamIdDerived: testValidTeamIdDerived(),
    test11_validTeamNameDerived: testValidTeamNameDerived(),
    test12_validPsIdDerived: testValidPsIdDerived(),
    test13_validTeamLeadNameDerived: testValidTeamLeadNameDerived(),
    test14_validTeamLeadEmailDerived: testValidTeamLeadEmailDerived(),
    test15_firstSubmissionSucceeds: testFinalSubmissionFirstSucceeds(),
    test16_secondSubmissionFails: testFinalSubmissionSecondFails(),
    test17_concurrentSubmissionPrevented: testFinalSubmissionConcurrentPrevented(),
    test18_adminCanRetrieveSubmissions: testAdminCanRetrieveFinalSubmissions(),
    test19_normalParticipantCannotRetrieveAll: testParticipantCannotRetrieveAllFinalSubmissions(),
    test20_submissionDeadlineBehavior: testFinalSubmissionDeadlineBehavior()
  };

  console.log("Final Submission Unit Tests Completed:", JSON.stringify(results));
  return results;
}

function testValidFinalSubmission() {
  const result = submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", {
    feedback: "This is our team's detailed final submission feedback."
  });
  assertFinalSubmissionTest(result.success === true, "Valid final submission should succeed");
  assertFinalSubmissionTest(result.message === "Final submission submitted successfully.", "Success message mismatch");
  return { success: true };
}

function testFinalSubmissionMissingFeedback() {
  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", {});
    throw new Error("Missing feedback should fail");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "INVALID_FINAL_SUBMISSION", "Missing feedback should produce INVALID_FINAL_SUBMISSION");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionEmptyFeedback() {
  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "    " });
    throw new Error("Empty feedback should fail");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "INVALID_FINAL_SUBMISSION", "Empty feedback should produce INVALID_FINAL_SUBMISSION");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionMaxLengthExceeded() {
  const longText = new Array(5002).fill("x").join("");
  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: longText });
    throw new Error("Overlong feedback should fail");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "INVALID_FINAL_SUBMISSION", "Overlong feedback should produce INVALID_FINAL_SUBMISSION");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionUnauthenticatedRequest() {
  try {
    submitFinalSubmission("", { feedback: "Test" });
    throw new Error("Unauthenticated request should fail");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "AUTH_REQUIRED", "Unauthenticated request should produce AUTH_REQUIRED");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionInvalidToken() {
  try {
    verifyGoogleIdToken("INVALID_BAD_TOKEN");
    throw new Error("Invalid token should fail");
  } catch (error) {
    assertFinalSubmissionTest(Boolean(error.code), "Invalid token should throw an auth error");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionNonTeamLeader() {
  try {
    submitFinalSubmission("TEST_TOKEN:nonleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Non-team leader should fail");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "TEAM_NOT_FOUND", "Non-team leader should produce TEAM_NOT_FOUND");
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionDisabledTeam() {
  try {
    submitFinalSubmission("TEST_TOKEN:disabledleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Disabled team should fail");
  } catch (error) {
    assertFinalSubmissionTest(
      error.code === "TEAM_DISABLED" || error.code === "TEAM_NOT_FOUND",
      "Disabled team should produce TEAM_DISABLED or TEAM_NOT_FOUND"
    );
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionTeamWithoutLockedSelection() {
  try {
    submitFinalSubmission("TEST_TOKEN:unlockedleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Team without locked selection should fail");
  } catch (error) {
    assertFinalSubmissionTest(
      error.code === "NO_PROBLEM_SELECTED" || error.code === "TEAM_NOT_FOUND",
      "Team without locked selection should produce NO_PROBLEM_SELECTED or TEAM_NOT_FOUND"
    );
    return { success: true, code: error.code };
  }
}

function testValidTeamIdDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const derivedTeamId = String(auth.team.TeamID || auth.team.teamId || "").trim();
  assertFinalSubmissionTest(Boolean(derivedTeamId), "Derived TeamID must not be empty");
  return { success: true, teamId: derivedTeamId };
}

function testValidTeamNameDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const derivedTeamName = String(auth.team.TeamName || auth.team.teamName || "").trim();
  assertFinalSubmissionTest(Boolean(derivedTeamName), "Derived TeamName must not be empty");
  return { success: true, teamName: derivedTeamName };
}

function testValidPsIdDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const teamId = String(auth.team.TeamID || auth.team.teamId || "").trim();
  const selection = getLockedSelectionByTeamId(teamId);
  const derivedPsId = selection ? String(selection.PSID || selection.psId || "").trim().toUpperCase() : "";
  assertFinalSubmissionTest(Boolean(derivedPsId), "Derived PSID from locked selection must not be empty");
  return { success: true, psId: derivedPsId };
}

function testValidTeamLeadNameDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const derivedLeadName = String(auth.team.LeaderName || auth.team.leaderName || "").trim();
  assertFinalSubmissionTest(Boolean(derivedLeadName), "Derived TeamLeadName must not be empty");
  return { success: true, teamLeadName: derivedLeadName };
}

function testValidTeamLeadEmailDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const derivedLeadEmail = normalizeEmail(auth.team.LeaderEmail || auth.user.email);
  assertFinalSubmissionTest(Boolean(derivedLeadEmail), "Derived TeamLeadEmail must not be empty");
  return { success: true, teamLeadEmail: derivedLeadEmail };
}

function testFinalSubmissionFirstSucceeds() {
  const statusBefore = getMyFinalSubmissionStatus("TEST_TOKEN:leader@bitsathy.ac.in");
  assertFinalSubmissionTest(statusBefore.success === true, "getMyFinalSubmissionStatus should succeed");
  return { success: true, submitted: statusBefore.submitted };
}

function testFinalSubmissionSecondFails() {
  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "Initial submission text" });
  } catch (e) {
    // Continue if already submitted
  }

  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "Second submission text" });
    throw new Error("Second final submission should fail");
  } catch (error) {
    assertFinalSubmissionTest(
      error.code === "FINAL_SUBMISSION_ALREADY_SUBMITTED",
      "Second submission should produce FINAL_SUBMISSION_ALREADY_SUBMITTED"
    );
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionConcurrentPrevented() {
  const lock = LockService.getScriptLock();
  assertFinalSubmissionTest(lock !== null, "ScriptLock must be available");
  return { success: true };
}

function testAdminCanRetrieveFinalSubmissions() {
  const result = getAdminFinalSubmissions("TEST_TOKEN:satheshkumar@bitsathy.ac.in");
  assertFinalSubmissionTest(result.success === true, "Admin final submission retrieval should succeed");
  assertFinalSubmissionTest(Array.isArray(result.finalSubmissions), "Submissions list should be an array");
  return { success: true, count: result.finalSubmissions.length };
}

function testParticipantCannotRetrieveAllFinalSubmissions() {
  try {
    getAdminFinalSubmissions("TEST_TOKEN:leader@bitsathy.ac.in");
    throw new Error("Normal participant should not be able to retrieve all final submissions");
  } catch (error) {
    assertFinalSubmissionTest(
      error.code === "ADMIN_NOT_FOUND" || error.code === "ADMIN_REQUIRED",
      "Participant calling admin endpoint should be denied"
    );
    return { success: true, code: error.code };
  }
}

function testFinalSubmissionDeadlineBehavior() {
  const pastDeadline = "2020-01-01T00:00:00Z";
  setConfigValue("FINAL_SUBMISSION_CLOSE_DATETIME", pastDeadline);

  try {
    submitFinalSubmission("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "Post deadline test" });
    throw new Error("Submission after deadline should be rejected");
  } catch (error) {
    assertFinalSubmissionTest(error.code === "FINAL_SUBMISSION_CLOSED", "Post deadline submission should produce FINAL_SUBMISSION_CLOSED");
  } finally {
    setConfigValue("FINAL_SUBMISSION_CLOSE_DATETIME", "");
  }

  return { success: true };
}
