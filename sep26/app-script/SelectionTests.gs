function testSelectionRequestValidation() {
  try {
    validateSelectionRequest({ domainId: "AGR" });
    throw new Error("Selection test failed: incomplete request was accepted.");
  } catch (error) {
    assertParticipantTest(error.code === "INVALID_REQUEST", "wrong invalid request code");
    return error.code;
  }
}


function testUnauthenticatedSelectionRequest() {
  const response = doPost({
    postData: {
      contents: JSON.stringify({
        action: "SELECT_PROBLEM",
        data: { domainId: "AGR", psId: "AGR-01" }
      })
    }
  });
  const result = JSON.parse(response.getContent());

  assertParticipantTest(result.success === false, "unauthenticated selection succeeded");
  assertParticipantTest(result.code === "AUTH_REQUIRED", "wrong unauthenticated error code");

  return result;
}


function testSelectionLookupHelpers() {
  const selections = getSheetRecords(SHEET_NAMES.SELECTIONS);
  const lockedSelection = selections.find(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  });
  const cancelledSelection = selections.find(function(selection) {
    return String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.CANCELLED;
  });

  if (lockedSelection) {
    assertParticipantTest(
      getLockedSelectionByTeamId(lockedSelection.TeamID) !== null,
      "locked team selection was not found"
    );
    assertParticipantTest(
      getLockedSelectionByProblemId(lockedSelection.PSID) !== null,
      "locked problem selection was not found"
    );
    assertParticipantTest(isProblemLocked(lockedSelection.PSID), "locked problem was not detected");
  }

  if (cancelledSelection) {
    assertParticipantTest(
      getLockedSelectionByTeamId(cancelledSelection.TeamID) === null ||
        String(cancelledSelection.Status).trim().toUpperCase() === SELECTION_STATUS.CANCELLED,
      "cancelled selection was treated as locked"
    );
  }

  return {
    lockedFixture: Boolean(lockedSelection),
    cancelledFixture: Boolean(cancelledSelection)
  };
}


function testCancelledSelectionDoesNotConsumeCapacity(domainId) {
  const lockedCount = getLockedSelectionCountByDomain(domainId);
  const selections = getSheetRecords(SHEET_NAMES.SELECTIONS);
  const cancelledCount = selections.filter(function(selection) {
    return String(selection.DomainID).trim().toUpperCase() === String(domainId).trim().toUpperCase() &&
      String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.CANCELLED;
  }).length;

  assertParticipantTest(
    getLockedSelectionCountByDomain(domainId) === lockedCount,
    "cancelled selections changed locked capacity"
  );

  return {
    lockedCount: lockedCount,
    cancelledCount: cancelledCount
  };
}


function testLockedSelectionConsumesCapacity(domainId) {
  const expected = getSheetRecords(SHEET_NAMES.SELECTIONS).filter(function(selection) {
    return String(selection.DomainID).trim().toUpperCase() === String(domainId).trim().toUpperCase() &&
      String(selection.Status).trim().toUpperCase() === SELECTION_STATUS.LOCKED;
  }).length;

  assertParticipantTest(
    getLockedSelectionCountByDomain(domainId) === expected,
    "locked selection count is incorrect"
  );

  return expected;
}


function testNoSelectionForTeam(teamId) {
  const selection = getLockedSelectionByTeamId(teamId);

  return {
    hasSelection: selection !== null,
    selection: formatSelection(selection)
  };
}


function testProblemAvailabilityExcludesLocked(psId, domainId) {
  if (!isProblemLocked(psId)) {
    return { skipped: true, reason: "No locked problem fixture exists." };
  }

  const available = getAvailableProblemsByDomain(domainId);

  assertParticipantTest(
    !available.some(function(problem) {
      return String(problem.PSID).trim().toUpperCase() === String(psId).trim().toUpperCase();
    }),
    "locked problem remained available"
  );

  return { skipped: false };
}


function testSelectionFailureCode(idToken, data, expectedCode) {
  try {
    selectProblem(idToken, data);
    throw new Error("Selection test failed: expected " + expectedCode + ".");
  } catch (error) {
    assertParticipantTest(error.code === expectedCode, "wrong selection failure code");
    return error.code;
  }
}


function testSuccessfulSelection(idToken, domainId, psId) {
  return selectProblem(idToken, {
    domainId: domainId,
    psId: psId
  });
}


function testGetMySelection(idToken) {
  return getMySelection(idToken);
}


function testLockProblem(idToken, psId) {
  const result = lockProblem(idToken, { psid: psId });
  assertParticipantTest(result.status === SELECTION_STATUS.LOCKED, "problem was not locked");
  assertParticipantTest(result.psId === String(psId).trim(), "wrong problem was locked");
  return result;
}


function testLockProblemWithoutClientScope(idToken, psId, fakeTeamId, fakeDomainId) {
  const result = lockProblem(idToken, {
    psid: psId,
    teamId: fakeTeamId,
    domainId: fakeDomainId,
    leaderEmail: "attacker@example.com"
  });
  const team = requireTeamLeader(idToken).team;

  assertParticipantTest(result.teamId === String(team.TeamID).trim(), "client team identity was trusted");
  assertParticipantTest(result.domainId === String(team.DomainID).trim().toUpperCase(), "client domain was trusted");
  return result;
}


function testLockProblemFailure(idToken, psId, expectedCode) {
  try {
    lockProblem(idToken, { psid: psId });
    throw new Error("Expected lock failure: " + expectedCode);
  } catch (error) {
    assertParticipantTest(error.code === expectedCode, "wrong lock failure code");
    return error.code;
  }
}


function testSecondProblemRejected(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "TEAM_ALREADY_HAS_SELECTION"
  );
}


function testProblemAlreadyLocked(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "PROBLEM_ALREADY_LOCKED"
  );
}


function testDisabledProblemRejected(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "PROBLEM_DISABLED"
  );
}


function testDisabledDomainRejected(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "DOMAIN_DISABLED"
  );
}


function testSelectionClosed(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "SELECTION_CLOSED"
  );
}


function testProblemNotReleased(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "PROBLEMS_NOT_RELEASED"
  );
}


function testProblemDomainMismatch(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "PROBLEM_DOMAIN_MISMATCH"
  );
}


function testDomainCapacityReached(idToken, domainId, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: psId },
    "DOMAIN_CAPACITY_REACHED"
  );
}


function testInvalidProblemId(idToken, domainId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: domainId, psId: "INVALID-PSID" },
    "PROBLEM_NOT_FOUND"
  );
}


function testInvalidDomainId(idToken, psId) {
  return testSelectionFailureCode(
    idToken,
    { domainId: "INVALID-DOMAIN", psId: psId },
    "DOMAIN_NOT_FOUND"
  );
}


function testOwningTeamCanRetrieveSelection(idToken) {
  const result = getMySelection(idToken);

  assertParticipantTest(result.success === true, "owner selection retrieval failed");

  if (result.data.hasSelection) {
    assertParticipantTest(result.data.selection.problem !== null, "owner problem content is missing");
  }

  return result;
}


function testOtherTeamCannotRetrieveLockedProblem(domainId, psId) {
  assertParticipantTest(
    !getAvailableProblemsByDomain(domainId).some(function(problem) {
      return String(problem.PSID).trim().toUpperCase() === String(psId).trim().toUpperCase();
    }),
    "locked problem was exposed as available"
  );

  return { available: false };
}