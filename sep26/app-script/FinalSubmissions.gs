function getOrCreateFinalSubmissionsSheet() {
  return getSheet(SHEET_NAMES.FINAL_SUBMISSIONS);
}


function submitFinalSubmission(idToken, data) {
  const auth = requireTeamLeader(idToken);
  const team = auth.team;
  const teamId = String(team && (team.TeamID || team.teamId || team["Team ID"]) || "").trim();
  const teamName = String(team && (team.TeamName || team.teamName || team["Team Name"]) || "").trim();
  const teamLeadName = String(team && (team.LeaderName || team.leaderName) || "").trim();
  const teamLeadEmail = normalizeEmail((team && (team.LeaderEmail || team.leaderEmail)) || auth.user.email);

  if (!teamId) {
    throwApiError("Team ID is missing.", "INVALID_TEAM_DATA");
  }

  const selection = getLockedSelectionByTeamId(teamId);
  if (!selection) {
    throwApiError("Your team has not selected a problem statement yet.", "NO_PROBLEM_SELECTED");
  }

  const psId = String(selection.PSID || selection.psId || "").trim().toUpperCase();
  if (!psId) {
    throwApiError("Your team has not selected a problem statement yet.", "NO_PROBLEM_SELECTED");
  }

  if (!data || typeof data.feedback !== "string") {
    throwApiError("Feedback is required.", "INVALID_FINAL_SUBMISSION");
  }

  const trimmedFeedback = data.feedback.trim();

  if (!trimmedFeedback) {
    throwApiError("Feedback cannot be empty.", "INVALID_FINAL_SUBMISSION");
  }

  if (trimmedFeedback.length > 5000) {
    throwApiError("Feedback exceeds maximum length of 5000 characters.", "INVALID_FINAL_SUBMISSION");
  }

  const closeDeadlineStr = getConfigValue("FINAL_SUBMISSION_CLOSE_DATETIME") || getConfigValue("FinalSubmissionCloseDateTime");
  if (closeDeadlineStr) {
    const deadline = parseFlexibleDateTime(closeDeadlineStr);
    if (deadline && new Date().getTime() >= deadline.getTime()) {
      throwApiError("Your team has passed the final submission deadline.", "FINAL_SUBMISSION_CLOSED");
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getOrCreateFinalSubmissionsSheet();
    const existingRow = findSheetRowNumber(SHEET_NAMES.FINAL_SUBMISSIONS, "TeamID", teamId);

    if (existingRow !== null) {
      throwApiError("Your team has already submitted the final submission.", "FINAL_SUBMISSION_ALREADY_SUBMITTED");
    }

    sheet.appendRow([
      teamId,
      teamName,
      psId,
      teamLeadName,
      teamLeadEmail,
      trimmedFeedback
    ]);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Final submission submitted successfully."
    };
  } finally {
    lock.releaseLock();
  }
}


function getMyFinalSubmissionStatus(idToken) {
  const auth = requireTeamLeader(idToken);
  const teamId = String(auth.team && (auth.team.TeamID || auth.team.teamId || auth.team["Team ID"]) || "").trim();

  const existingRow = findSheetRowNumber(SHEET_NAMES.FINAL_SUBMISSIONS, "TeamID", teamId);

  return {
    success: true,
    submitted: existingRow !== null
  };
}


function getAdminFinalSubmissions(idToken) {
  requireAdmin(idToken);
  getOrCreateFinalSubmissionsSheet();

  const records = getSheetRecords(SHEET_NAMES.FINAL_SUBMISSIONS);

  const finalSubmissions = records.map(function(r) {
    return {
      teamId: String(r.TeamID || r.teamId || r["Team ID"] || "").trim(),
      teamName: String(r.TeamName || r.teamName || r["Team Name"] || "").trim(),
      psId: String(r.PSID || r.psId || "").trim().toUpperCase(),
      teamLeadName: String(r.TeamLeadName || r.LeaderName || r.teamLeadName || "").trim(),
      teamLeadEmail: normalizeEmail(r.TeamLeadEmail || r.LeaderEmail || r.teamLeadEmail),
      feedback: String(r.Feedback || r.feedback || "").trim()
    };
  });

  return {
    success: true,
    finalSubmissions: finalSubmissions
  };
}
