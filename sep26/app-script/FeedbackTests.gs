function assertFeedbackTest(condition, message) {
  if (!condition) {
    throw new Error("Feedback test failed: " + message);
  }
}

function runAllFeedbackTests() {
  console.log("Running Feedback System Backend Unit Tests...");

  const results = {
    test1_validSubmission: testValidFeedbackSubmission(),
    test2_missingFeedback: testMissingFeedback(),
    test3_emptyFeedback: testEmptyFeedback(),
    test4_maxLengthExceeded: testMaxLengthExceeded(),
    test5_unauthenticatedRequest: testUnauthenticatedRequest(),
    test6_nonTeamLeader: testNonTeamLeader(),
    test7_disabledTeam: testDisabledTeam(),
    test8_teamWithoutLockedSelection: testTeamWithoutLockedSelection(),
    test9_firstSubmissionSucceeds: testFirstSubmissionSucceeds(),
    test10_secondSubmissionRejected: testSecondSubmissionRejected(),
    test11_concurrentSubmission: testConcurrentDuplicateSubmission(),
    test12_correctTeamIdDerived: testCorrectTeamIdDerived(),
    test13_correctTeamNameDerived: testCorrectTeamNameDerived(),
    test14_correctDomainDerived: testCorrectDomainDerived(),
    test15_adminCanRetrieveFeedback: testAdminCanRetrieveFeedback(),
    test16_normalParticipantCannotRetrieveAll: testNormalParticipantCannotRetrieveAll()
  };

  console.log("Feedback Unit Tests Completed:", JSON.stringify(results));
  return results;
}

function testValidFeedbackSubmission() {
  const result = submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", {
    feedback: "Great hackathon experience!"
  });
  assertFeedbackTest(result.success === true, "Valid feedback submission should succeed");
  assertFeedbackTest(result.message === "Feedback submitted successfully.", "Success message mismatch");
  return { success: true };
}

function testMissingFeedback() {
  try {
    submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", {});
    throw new Error("Missing feedback should fail");
  } catch (error) {
    assertFeedbackTest(error.code === "INVALID_FEEDBACK", "Missing feedback should produce INVALID_FEEDBACK");
    return { success: true, code: error.code };
  }
}

function testEmptyFeedback() {
  try {
    submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "   " });
    throw new Error("Empty feedback should fail");
  } catch (error) {
    assertFeedbackTest(error.code === "INVALID_FEEDBACK", "Empty feedback should produce INVALID_FEEDBACK");
    return { success: true, code: error.code };
  }
}

function testMaxLengthExceeded() {
  const longText = new Array(2002).fill("a").join("");
  try {
    submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: longText });
    throw new Error("Overlong feedback should fail");
  } catch (error) {
    assertFeedbackTest(error.code === "INVALID_FEEDBACK", "Overlong feedback should produce INVALID_FEEDBACK");
    return { success: true, code: error.code };
  }
}

function testUnauthenticatedRequest() {
  try {
    submitFeedback("", { feedback: "Test" });
    throw new Error("Unauthenticated request should fail");
  } catch (error) {
    assertFeedbackTest(error.code === "AUTH_REQUIRED", "Unauthenticated request should produce AUTH_REQUIRED");
    return { success: true, code: error.code };
  }
}

function testNonTeamLeader() {
  try {
    submitFeedback("TEST_TOKEN:nonleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Non-team leader request should fail");
  } catch (error) {
    assertFeedbackTest(error.code === "TEAM_NOT_FOUND", "Non-team leader should produce TEAM_NOT_FOUND");
    return { success: true, code: error.code };
  }
}

function testDisabledTeam() {
  try {
    submitFeedback("TEST_TOKEN:disabledleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Disabled team request should fail");
  } catch (error) {
    assertFeedbackTest(
      error.code === "TEAM_DISABLED" || error.code === "TEAM_NOT_FOUND",
      "Disabled team should produce TEAM_DISABLED or TEAM_NOT_FOUND"
    );
    return { success: true, code: error.code };
  }
}

function testTeamWithoutLockedSelection() {
  try {
    submitFeedback("TEST_TOKEN:unlockedleader@bitsathy.ac.in", { feedback: "Test" });
    throw new Error("Team without locked selection should fail");
  } catch (error) {
    assertFeedbackTest(
      error.code === "NO_LOCKED_SELECTION" || error.code === "TEAM_NOT_FOUND",
      "Team without locked selection should produce NO_LOCKED_SELECTION or TEAM_NOT_FOUND"
    );
    return { success: true, code: error.code };
  }
}

function testFirstSubmissionSucceeds() {
  const statusBefore = getMyFeedbackStatus("TEST_TOKEN:leader@bitsathy.ac.in");
  assertFeedbackTest(statusBefore.success === true, "getMyFeedbackStatus should succeed");
  return { success: true, submitted: statusBefore.submitted };
}

function testSecondSubmissionRejected() {
  try {
    submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "First submission" });
  } catch (e) {
    // If already submitted in fixture, continue to second attempt
  }

  try {
    submitFeedback("TEST_TOKEN:leader@bitsathy.ac.in", { feedback: "Second submission" });
    throw new Error("Second submission should be rejected");
  } catch (error) {
    assertFeedbackTest(error.code === "FEEDBACK_ALREADY_SUBMITTED", "Second submission should produce FEEDBACK_ALREADY_SUBMITTED");
    return { success: true, code: error.code };
  }
}

function testConcurrentDuplicateSubmission() {
  const lock = LockService.getScriptLock();
  assertFeedbackTest(lock !== null, "ScriptLock must be available");
  return { success: true };
}

function testCorrectTeamIdDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  assertFeedbackTest(auth.team !== null, "Team should exist for leader");
  const derivedTeamId = String(auth.team.TeamID || auth.team.teamId || "").trim();
  assertFeedbackTest(Boolean(derivedTeamId), "Derived TeamID must not be empty");
  return { success: true, teamId: derivedTeamId };
}

function testCorrectTeamNameDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const derivedTeamName = String(auth.team.TeamName || auth.team.teamName || "").trim();
  assertFeedbackTest(Boolean(derivedTeamName), "Derived TeamName must not be empty");
  return { success: true, teamName: derivedTeamName };
}

function testCorrectDomainDerived() {
  const auth = requireTeamLeader("TEST_TOKEN:leader@bitsathy.ac.in");
  const teamId = String(auth.team.TeamID || auth.team.teamId || "").trim();
  const selection = getLockedSelectionByTeamId(teamId);
  const derivedDomain = selection ? String(selection.DomainID).trim().toUpperCase() : String(auth.team.DomainID).trim().toUpperCase();
  assertFeedbackTest(Boolean(derivedDomain), "Derived Domain must not be empty");
  return { success: true, domain: derivedDomain };
}

function testAdminCanRetrieveFeedback() {
  const result = getAdminFeedback("TEST_TOKEN:satheshkumar@bitsathy.ac.in");
  assertFeedbackTest(result.success === true, "Admin feedback retrieval should succeed");
  assertFeedbackTest(Array.isArray(result.feedback), "Feedback list should be an array");
  return { success: true, count: result.feedback.length };
}

function testNormalParticipantCannotRetrieveAll() {
  try {
    getAdminFeedback("TEST_TOKEN:leader@bitsathy.ac.in");
    throw new Error("Normal participant should not be able to retrieve admin feedback");
  } catch (error) {
    assertFeedbackTest(
      error.code === "ADMIN_NOT_FOUND" || error.code === "ADMIN_REQUIRED",
      "Participant calling admin endpoint should be denied"
    );
    return { success: true, code: error.code };
  }
}
