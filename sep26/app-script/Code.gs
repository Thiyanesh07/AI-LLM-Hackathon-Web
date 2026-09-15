function testBackend() {
  const spreadsheet = getSpreadsheet();

  const sheetNames = Object.values(SHEET_NAMES);

  const result = {};

  sheetNames.forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);

    result[sheetName] = sheet !== null;
  });

  console.log("Spreadsheet:", spreadsheet.getName());
  console.log("Sheets:", result);

  return result;
}

function testTeamIdGeneration() {
  const teamId = generateNextTeamId();

  console.log("Generated Team ID:", teamId);

  return teamId;
}


function testTeamRegistrationValidation() {
  const testData = {
    teamName: "Test Team",

    leaderName: "Test Leader",
    leaderMobile: "+91 9000000001",
    leaderEmail: "test@bitsathy.ac.in",
    leaderRegisterNumber: "BIT001",
    leaderDepartment: "CSE",

    members: [
      {
        name: "Member One",
        registerNumber: "BIT002",
        department: "CSE"
      },
      {
        name: "Member Two",
        registerNumber: "BIT003",
        department: "IT"
      }
    ]
  };

  const result = validateTeamRegistration(testData);

  console.log("Validation result:", result);

  return result;
}

function testDuplicateCheck() {
  const testData = {
    teamName: "Test Team",

    leaderName: "Test Leader",
    leaderMobile: "+91 9000000002",
    leaderEmail: "test2@bitsathy.ac.in",
    leaderRegisterNumber: "BIT101",
    leaderDepartment: "CSE",

    members: [
      {
        name: "Member One",
        registerNumber: "BIT102",
        department: "CSE"
      },
      {
        name: "Member Two",
        registerNumber: "BIT103",
        department: "IT"
      }
    ]
  };

  const result = checkDuplicateTeamRegistration(testData);

  console.log("Duplicate check:", result);

  return result;
}

function testCreateTeam() {
  const testData = {
    teamName: "Test Team",

    leaderName: "Test Leader",
    leaderMobile: "+91 9000000003",
    leaderEmail: "testleader@bitsathy.ac.in",
    leaderRegisterNumber: "BIT201",
    leaderDepartment: "CSE",

    members: [
      {
        name: "Member One",
        registerNumber: "BIT202",
        department: "CSE"
      },
      {
        name: "Member Two",
        registerNumber: "BIT203",
        department: "IT"
      }
    ]
  };

  const result = createTeam(testData);

  console.log("Created team:", result);

  return result;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throwApiError("Request body is missing.", "INVALID_REQUEST");
    }

    let request;

    try {
      request = JSON.parse(e.postData.contents);
    } catch (error) {
      throwApiError("Request body must be valid JSON.", "INVALID_REQUEST");
    }

    if (!request.action) {
      throwApiError("Request action is required.", "INVALID_REQUEST");
    }

    switch (request.action) {

      case "REGISTER_TEAM":
        return createJsonResponse(apiRegisterTeam(request.idToken, request.data));

      case "GET_TEAM":
        return createJsonResponse(apiGetTeam(request.idToken));

      case "GET_DOMAINS":
        return createJsonResponse(apiGetDomains(request.idToken));

      case "SELECT_DOMAIN":
        return createJsonResponse(apiSelectDomain(request.idToken, request.data || request.domainId));

      case "GET_PROBLEMS":
        return createJsonResponse(apiGetProblems(request.idToken, request.data));

      case "SELECT_PROBLEM":
        return createJsonResponse(apiSelectProblem(request.idToken, request.data));

      case "LOCK_PROBLEM":
        return createJsonResponse(apiLockProblem(request.idToken, request.data));

      case "GET_MY_SELECTION":
        return createJsonResponse(apiGetMySelection(request.idToken));

      case "SUBMIT_FEEDBACK":
        return createJsonResponse(apiSubmitFeedback(request.idToken, request.data));

      case "GET_MY_FEEDBACK_STATUS":
        return createJsonResponse(apiGetMyFeedbackStatus(request.idToken));

      case "ADMIN_GET_FEEDBACK":
        return createJsonResponse(apiAdminGetFeedback(request.idToken));

      case "SUBMIT_FINAL_SUBMISSION":
        return createJsonResponse(apiSubmitFinalSubmission(request.idToken, request.data));

      case "GET_MY_FINAL_SUBMISSION_STATUS":
        return createJsonResponse(apiGetMyFinalSubmissionStatus(request.idToken));

      case "ADMIN_GET_FINAL_SUBMISSIONS":
        return createJsonResponse(apiAdminGetFinalSubmissions(request.idToken));

      case "ADMIN_GET_STATS":
        return createJsonResponse(apiAdminGetStats(request.idToken));

      case "GET_ADMIN_STATISTICS":
        return createJsonResponse(apiAdminGetStats(request.idToken));

      case "ADMIN_GET_CONFIG":
        return createJsonResponse(apiAdminGetConfiguration(request.idToken));

      case "ADMIN_UPDATE_CONFIG":
        return createJsonResponse(apiAdminUpdateConfiguration(request.idToken, request.data || {}));

      case "ADMIN_GET_TEAMS":
        return createJsonResponse(apiAdminGetTeams(request.idToken, request.data));

      case "ADMIN_ADD_TEAM":
        return createJsonResponse(apiAdminAddTeam(request.idToken, request.data || {}));

      case "ADMIN_UPDATE_TEAM":
        return createJsonResponse(apiAdminUpdateTeam(request.idToken, request.data || {}));

      case "ADMIN_ENABLE_TEAM":
        return createJsonResponse(apiAdminEnableTeam(request.idToken, request.data));

      case "ADMIN_DISABLE_TEAM":
        return createJsonResponse(apiAdminDisableTeam(request.idToken, request.data));

      case "ADMIN_GET_PROBLEMS":
        return createJsonResponse(apiAdminGetProblems(request.idToken));

      case "ADMIN_ADD_PROBLEM":
        return createJsonResponse(apiAdminAddProblem(request.idToken, request.data || {}));

      case "ADMIN_UPDATE_PROBLEM":
        return createJsonResponse(apiAdminUpdateProblem(request.idToken, request.data || {}));

      case "ADMIN_ENABLE_PROBLEM":
        return createJsonResponse(apiAdminEnableProblem(request.idToken, request.data));

      case "ADMIN_DISABLE_PROBLEM":
        return createJsonResponse(apiAdminDisableProblem(request.idToken, request.data));

      case "ADMIN_GET_DOMAINS":
        return createJsonResponse(apiAdminGetDomains(request.idToken));

      case "ADMIN_UPDATE_DOMAIN":
        return createJsonResponse(apiAdminUpdateDomain(request.idToken, request.data || {}));

      case "ADMIN_RELEASE_NOW":
        return createJsonResponse(apiAdminReleaseNow(request.idToken));

      case "ADMIN_CLOSE_SELECTION":
        return createJsonResponse(apiAdminCloseSelection(request.idToken));

      case "ADMIN_OPEN_SELECTION":
        return createJsonResponse(apiAdminOpenSelection(request.idToken));

      case "ADMIN_REMOVE_TEAM_SELECTION":
        return createJsonResponse(apiAdminRemoveTeamSelection(request.idToken, request.data));

      case "ADMIN_REMOVE_SELECTION_BY_PSID":
        return createJsonResponse(apiAdminRemoveSelectionByPsid(request.idToken, request.data));

      case "ADMIN_REMOVE_ALL_SELECTIONS":
        return createJsonResponse(apiAdminRemoveAllSelections(request.idToken));

      case "ADMIN_SET_ALLOW_RESET":
        return createJsonResponse(apiAdminSetAllowReset(request.idToken, request.data));

      case "ADMIN_GET_SELECTIONS":
        return createJsonResponse(apiAdminGetSelections(request.idToken));

      case "ADMIN_GET_ALL_DATA":
        return createJsonResponse(apiAdminGetAllData(request.idToken));

      case "GET_FORENSIC_TEAMS":
      case "FORENSIC_INSPECTION":
        return createJsonResponse({
          success: true,
          exactHeaders: getSheet(SHEET_NAMES.TEAMS).getRange(1, 1, 1, getSheet(SHEET_NAMES.TEAMS).getLastColumn()).getValues()[0],
          records: {
            teams: getSheetRecords(SHEET_NAMES.TEAMS),
            problems: getSheetRecords(SHEET_NAMES.PROBLEMS),
            selections: getSheetRecords(SHEET_NAMES.SELECTIONS),
            domains: getSheetRecords(SHEET_NAMES.DOMAINS),
            admins: getSheetRecords(SHEET_NAMES.ADMINS),
            config: getSheetRecords(SHEET_NAMES.CONFIG),
            feedback: getSheetRecords(SHEET_NAMES.FEEDBACK),
            finalSubmissions: getSheetRecords(SHEET_NAMES.FINAL_SUBMISSIONS)
          }
        });

      default:
        throwApiError("The requested action is not supported.", "INVALID_ACTION");
    }

  } catch (error) {

    console.error(error && error.message ? error.message : error);

    return createJsonResponse({
      success: false,
      error: error.message || "An unexpected error occurred.",
      code: error.code || "INTERNAL_ERROR"
    });
  }
}


function throwApiError(message, code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testDoPost() {
  const testRequest = {
    action: "REGISTER_TEAM",

    data: {
      teamName: "API Test Team",

      leaderName: "API Test Leader",
      leaderMobile: "+91 9000000004",
      leaderEmail: "apitest@bitsathy.ac.in",
      leaderRegisterNumber: "BIT301",
      leaderDepartment: "CSE",

      members: [
        {
          name: "API Member One",
          registerNumber: "BIT302",
          department: "CSE"
        },
        {
          name: "API Member Two",
          registerNumber: "BIT303",
          department: "IT"
        }
      ]
    }
  };

  const fakeEvent = {
    postData: {
      contents: JSON.stringify(testRequest)
    }
  };

  const response = doPost(fakeEvent);

  console.log("API response:", response.getContent());
}


function doGet(e) {
  if (e && e.parameter && e.parameter.view === "html") {
    return HtmlService
      .createHtmlOutputFromFile("index")
      .setTitle("AI Hackathon");
  }

  return ContentService
    .createTextOutput(JSON.stringify(getHealth()))
    .setMimeType(ContentService.MimeType.JSON);
}


function getHealth() {
  return {
    success: true,
    service: "AI Hackathon API",
    status: "ONLINE"
  };
}


function testAuthWithoutToken() {
  try {
    verifyGoogleIdToken("");

    console.log("ERROR: Invalid token was accepted.");

  } catch (error) {
    console.log("Expected authentication failure:", error.message);
  }
}


function getRequestedTeamId(data) {
  let val = "";
  if (data && typeof data === "object") {
    val = data.teamId || data.teamID || data.TeamID || data.TeamId || "";
  } else if (typeof data === "string") {
    val = data;
  }
  const teamId = String(val || "").trim();

  if (!teamId) {
    throwApiError("TeamID is required.", "INVALID_REQUEST");
  }

  return teamId;
}


function getRequestedProblemId(data) {
  let val = "";
  if (data && typeof data === "object") {
    val = data.psid || data.psId || data.PSID || data.Psid || "";
  } else if (typeof data === "string") {
    val = data;
  }
  const psId = String(val || "").trim().toUpperCase();

  if (!psId) {
    throwApiError("PSID is required.", "INVALID_REQUEST");
  }

  return psId;
}


function runForensicInspection() {
  const teamsSheet = getSheet(SHEET_NAMES.TEAMS);
  const teamsData = teamsSheet.getDataRange().getValues();
  const headers = teamsData.length > 0 ? teamsData[0].map(function(h) { return String(h); }) : [];

  const rows = [];
  for (let i = 1; i < teamsData.length; i++) {
    const r = teamsData[i];
    rows.push({
      rowIndex: i + 1,
      col1_raw: String(r[0] === undefined || r[0] === null ? "" : r[0]),
      col1_trimmed: String(r[0] === undefined || r[0] === null ? "" : r[0]).trim(),
      teamName: String(r[1] === undefined || r[1] === null ? "" : r[1]).trim(),
      leaderName: String(r[2] === undefined || r[2] === null ? "" : r[2]).trim(),
      leaderEmail: String(r[3] === undefined || r[3] === null ? "" : r[3]).trim(),
      createdAt: r[19] instanceof Date ? r[19].toISOString() : String(r[19] === undefined || r[19] === null ? "" : r[19]),
      domainId: String(r[r.length - 1] === undefined || r[r.length - 1] === null ? "" : r[r.length - 1]).trim(),
      status: String(r[18] === undefined || r[18] === null ? "" : r[18]).trim(),
      allFields: r.map(function(cell) { return cell instanceof Date ? cell.toISOString() : String(cell === undefined || cell === null ? "" : cell); })
    });
  }

  const selectionsSheet = getSheet(SHEET_NAMES.SELECTIONS);
  const selectionsData = selectionsSheet.getDataRange().getValues();
  const selections = [];
  if (selectionsData.length > 1) {
    for (let j = 1; j < selectionsData.length; j++) {
      const sr = selectionsData[j];
      selections.push({
        rowIndex: j + 1,
        teamId: String(sr[0] === undefined || sr[0] === null ? "" : sr[0]).trim(),
        domainId: String(sr[1] === undefined || sr[1] === null ? "" : sr[1]).trim(),
        psid: String(sr[2] === undefined || sr[2] === null ? "" : sr[2]).trim(),
        status: String(sr[4] === undefined || sr[4] === null ? "" : sr[4]).trim()
      });
    }
  }

  const result = {
    exactHeaders: headers,
    totalRowsIncludingHeader: teamsData.length,
    rows: rows,
    selections: selections
  };

  Logger.log("FORENSIC_RESULT: " + JSON.stringify(result));
  return JSON.stringify(result);
}