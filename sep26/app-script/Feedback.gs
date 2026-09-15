function getOrCreateFeedbackSheet() {
  return getSheet(SHEET_NAMES.FEEDBACK);
}


function submitFeedback(idToken, data) {
  const auth = requireTeamLeader(idToken);
  const team = auth.team;
  const teamId = String(team && (team.TeamID || team.teamId || team["Team ID"]) || "").trim();
  const teamName = String(team && (team.TeamName || team.teamName || team["Team Name"]) || "").trim();

  if (!teamId) {
    throwApiError("Team ID is missing.", "INVALID_TEAM_DATA");
  }

  const selection = getLockedSelectionByTeamId(teamId);
  if (!selection) {
    throwApiError("A locked problem selection is required before submitting feedback.", "NO_LOCKED_SELECTION");
  }

  const domain = String(selection.DomainID || team.DomainID || "").trim().toUpperCase();

  if (!data || typeof data.feedback !== "string") {
    throwApiError("Feedback is required.", "INVALID_FEEDBACK");
  }

  const trimmedFeedback = data.feedback.trim();

  if (!trimmedFeedback) {
    throwApiError("Feedback cannot be empty.", "INVALID_FEEDBACK");
  }

  if (trimmedFeedback.length > 2000) {
    throwApiError("Feedback exceeds maximum length of 2000 characters.", "INVALID_FEEDBACK");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getOrCreateFeedbackSheet();
    const existingRow = findSheetRowNumber(SHEET_NAMES.FEEDBACK, "TeamID", teamId);

    if (existingRow !== null) {
      throwApiError("Feedback has already been submitted for this team.", "FEEDBACK_ALREADY_SUBMITTED");
    }

    sheet.appendRow([
      teamId,
      teamName,
      domain,
      trimmedFeedback
    ]);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Feedback submitted successfully."
    };
  } finally {
    lock.releaseLock();
  }
}


function getMyFeedbackStatus(idToken) {
  const auth = requireTeamLeader(idToken);
  const teamId = String(auth.team && (auth.team.TeamID || auth.team.teamId || auth.team["Team ID"]) || "").trim();

  const existingRow = findSheetRowNumber(SHEET_NAMES.FEEDBACK, "TeamID", teamId);

  return {
    success: true,
    submitted: existingRow !== null
  };
}


function getAdminFeedback(idToken) {
  requireAdmin(idToken);
  getOrCreateFeedbackSheet();

  const records = getSheetRecords(SHEET_NAMES.FEEDBACK);

  const feedbackList = records.map(function(r) {
    return {
      teamId: String(r.TeamID || r.teamId || r["Team ID"] || "").trim(),
      teamName: String(r.TeamName || r.teamName || r["Team Name"] || "").trim(),
      domain: String(r.Domain || r.domain || r.DomainID || "").trim(),
      feedback: String(r.Feedback || r.feedback || "").trim()
    };
  });

  return {
    success: true,
    feedback: feedbackList
  };
}
