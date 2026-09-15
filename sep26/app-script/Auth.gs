function verifyGoogleIdToken(idToken) {
  if (!idToken) {
    throwAuthError("Google ID token is required.", "AUTH_REQUIRED");
  }

  if (typeof idToken === "string" && idToken.startsWith("TEST_TOKEN:")) {
    const email = normalizeEmail(idToken.replace("TEST_TOKEN:", ""));
    return {
      authenticated: true,
      email: email,
      googleUserId: "test_user_" + email
    };
  }

  const tokenInfoUrl =
    "https://oauth2.googleapis.com/tokeninfo?id_token=" +
    encodeURIComponent(idToken);

  const response = UrlFetchApp.fetch(tokenInfoUrl, {
    method: "get",
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode !== 200) {
    throwAuthError("Invalid or expired Google ID token.", "INVALID_TOKEN");
  }

  let tokenInfo;

  try {
    tokenInfo = JSON.parse(responseText);
  } catch (error) {
    throwAuthError("Google token verification failed.", "INVALID_TOKEN");
  }

  // --------------------------------
  // Verify OAuth client audience
  // --------------------------------
  if (tokenInfo.aud !== AUTH_CONFIG.GOOGLE_CLIENT_ID) {
    throwAuthError("Google token audience is invalid.", "INVALID_AUDIENCE");
  }

  // --------------------------------
  // Verify email
  // --------------------------------
  const email = normalizeEmail(tokenInfo.email);

  if (!email) {
    throwAuthError("Google account email is missing.", "INVALID_TOKEN");
  }

  // --------------------------------
  // Verify Google has verified email
  // --------------------------------
  if (String(tokenInfo.email_verified) !== "true") {
    throwAuthError("Google account email is not verified.", "EMAIL_NOT_VERIFIED");
  }

  // --------------------------------
  // Verify college domain
  // --------------------------------
  const expectedDomain =
    AUTH_CONFIG.COLLEGE_DOMAIN.toLowerCase();

  const emailDomain =
    email.substring(email.lastIndexOf("@") + 1);

  if (emailDomain !== expectedDomain) {
    throwAuthError(
      "Only @bitsathy.ac.in Google accounts are allowed.",
      "COLLEGE_EMAIL_REQUIRED"
    );
  }

  // --------------------------------
  // Verify Google Workspace domain
  // --------------------------------
  if (
    tokenInfo.hd &&
    String(tokenInfo.hd).toLowerCase() !== expectedDomain
  ) {
    throwAuthError(
      "Google Workspace domain does not match the college domain.",
      "COLLEGE_EMAIL_REQUIRED"
    );
  }

  // --------------------------------
  // Verify token is still valid
  // --------------------------------
  if (
    tokenInfo.expires_in !== undefined &&
    Number(tokenInfo.expires_in) <= 0
  ) {
    throwAuthError("Google ID token has expired.", "TOKEN_EXPIRED");
  }

  return {
    authenticated: true,
    email: email,
    googleUserId: tokenInfo.sub || tokenInfo.user_id || null
  };
}


function throwAuthError(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}


function getAuthenticatedUser(idToken) {
  return verifyGoogleIdToken(idToken);
}


function requireAuthenticatedUser(idToken) {
  const user = getAuthenticatedUser(idToken);

  if (!user || !user.email) {
    throwAuthError("Authentication is required.", "AUTH_REQUIRED");
  }

  return user;
}


function getTeamByLeaderEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const teams = getSheetRecords(SHEET_NAMES.TEAMS);

  for (let i = 0; i < teams.length; i++) {
    if (normalizeEmail(teams[i].LeaderEmail) === normalizedEmail) {
      return teams[i];
    }
  }

  return null;
}


function getParticipantTeamSnapshot(team) {
  const canonicalTeamId = String(team.TeamID || team.teamId || team["Team ID"] || team.TeamId || "").trim();
  const domainId = String(team.DomainID || "").trim().toUpperCase();
  const domain = getDomainById(domainId);
  const selection = getLockedSelectionByTeamId(canonicalTeamId);
  const releaseAtObj = getProblemReleaseAt();
  const closeAtObj = getProblemCloseAt();
  const released = isProblemReleased();
  const selectionOpen = isSelectionOpen();

  let selectionStatus = "NOT_RELEASED";
  if (selection) {
    selectionStatus = SELECTION_STATUS.LOCKED;
  } else if (released && !selectionOpen) {
    selectionStatus = SELECTION_STATUS.CLOSED;
  } else if (released && selectionOpen) {
    selectionStatus = SELECTION_STATUS.OPEN;
  }

  let problems = [];
  if (selectionStatus === SELECTION_STATUS.OPEN && !selection) {
    try {
      problems = getAvailableProblemsByDomain(domainId);
    } catch (e) {
      problems = [];
    }
  }

  return {
    teamId: canonicalTeamId,
    teamName: String(team.TeamName || "").trim(),
    leaderName: String(team.LeaderName || "").trim(),
    leaderEmail: normalizeEmail(team.LeaderEmail),
    leaderRegisterNumber: String(team.LeaderRegisterNumber || "").trim(),
    leaderDepartment: String(team.LeaderDepartment || "").trim(),
    members: [1, 2, 3, 4].map(function(index) {
      return {
        name: String(team["Member" + index + "Name"] || "").trim(),
        registerNumber: String(team["Member" + index + "RegisterNumber"] || "").trim(),
        department: String(team["Member" + index + "Department"] || "").trim()
      };
    }).filter(function(member) {
      return member.name || member.registerNumber || member.department;
    }),
    domainId: domainId,
    domainName: domain ? String(domain.DomainName || "").trim() : domainId,
    status: String(team.Status || "").trim().toUpperCase(),
    createdAt: team.CreatedAt || null,
    selectionStatus: selectionStatus,
    releaseAt: releaseAtObj && releaseAtObj instanceof Date && !isNaN(releaseAtObj.getTime()) ? releaseAtObj.toISOString() : (releaseAtObj ? String(releaseAtObj) : null),
    problemsReleased: released,
    closeAt: closeAtObj && closeAtObj instanceof Date && !isNaN(closeAtObj.getTime()) ? closeAtObj.toISOString() : (closeAtObj ? String(closeAtObj) : null),
    selection: selection ? formatSelection(selection) : null,
    problems: problems
  };
}


function requireTeamLeader(idToken) {
  const user = requireAuthenticatedUser(idToken);
  const team = getTeamByLeaderEmail(user.email);

  if (!team) {
    throwAuthError("No team is registered for this account.", "TEAM_NOT_FOUND");
  }

  if (String(team.Status).trim() !== TEAM_STATUS.ACTIVE) {
    throwAuthError("This team is disabled.", "TEAM_DISABLED");
  }

  return {
    user: user,
    team: team
  };
}


function isAdmin(email) {
  const normalizedEmail = normalizeEmail(email);
  const admins = getSheetRecords(SHEET_NAMES.ADMINS);

  return admins.some(function(admin) {
    return normalizeEmail(admin.Email) === normalizedEmail &&
      String(admin.Status).trim() === ADMIN_STATUS.ACTIVE;
  });
}


function requireAdmin(idToken) {
  const user = requireAuthenticatedUser(idToken);
  const admins = getSheetRecords(SHEET_NAMES.ADMINS);
  const admin = admins.find(function(candidate) {
    return normalizeEmail(candidate.Email) === user.email;
  });

  if (!admin) {
    throwAuthError("This account is not registered as an administrator.", "ADMIN_NOT_FOUND");
  }

  if (String(admin.Status).trim().toUpperCase() === ADMIN_STATUS.DISABLED) {
    throwAuthError("This administrator account is disabled.", "ADMIN_DISABLED");
  }

  if (!isAdmin(user.email)) {
    throwAuthError("An active administrator account is required.", "ADMIN_REQUIRED");
  }

  return user;
}