const mockDomains = [
  {
    domainId: "AGR",
    domainName: "Agriculture & Rural Development",
    maximumTeams: 12,
    currentLockedTeams: 1,
    remainingCapacity: 11,
    available: true
  },
  {
    domainId: "EMP",
    domainName: "Skills, Employment & Entrepreneurship",
    maximumTeams: 12,
    currentLockedTeams: 0,
    remainingCapacity: 12,
    available: true
  },
  {
    domainId: "EDU",
    domainName: "Education & Knowledge",
    maximumTeams: 10,
    currentLockedTeams: 2,
    remainingCapacity: 8,
    available: true
  },
  {
    domainId: "GOV",
    domainName: "Government & Public Services",
    maximumTeams: 10,
    currentLockedTeams: 0,
    remainingCapacity: 10,
    available: true
  }
];

const mockLockedSelections = new Map();
let mockSelectedDomain = null;
let mockTeamCounter = 0;

const mockProblemConfig = {
  selectionState: (typeof import.meta !== "undefined" && import.meta.env?.VITE_MOCK_SELECTION_STATE) || "NOT_RELEASED",
  releaseAt: (typeof import.meta !== "undefined" && import.meta.env?.VITE_MOCK_RELEASE_AT) || "2026-09-15T04:30:00.000Z",
  problems: [
    { PSID: "AGR-01", DomainID: "AGR", Title: "Farm Support Finder", Description: "Help farmers discover relevant public support programs.", WhatToBuild: "Build a focused search and guidance experience." },
    { PSID: "AGR-02", DomainID: "AGR", Title: "Crop Advisory Companion", Description: "Make practical crop advice easier to find and understand.", WhatToBuild: "Build a simple advisory workflow for rural users." },
    { PSID: "AGR-03", DomainID: "AGR", Title: "Rural Market Link", Description: "Connect small producers with useful local market information.", WhatToBuild: "Build a clear market discovery experience." },
    { PSID: "EDU-01", DomainID: "EDU", Title: "Learning Path Finder", Description: "Help learners discover relevant learning pathways.", WhatToBuild: "Build a clear education discovery workflow." },
    { PSID: "EDU-02", DomainID: "EDU", Title: "Campus Knowledge Hub", Description: "Make useful academic resources easier to navigate.", WhatToBuild: "Build a searchable knowledge experience."
    }
  ]
};

const mockRegisteredLeaderEmails = new Set();
const mockRegisteredRegNumbers = new Set();

const mockTeam = {
  teamId: "BIT-AI-001",
  teamName: "IntelliX Builders",
  leaderName: "Team Leader",
  leaderEmail: "leader@bitsathy.ac.in",
  leaderRegisterNumber: "BIT001",
  leaderDepartment: "CSE",
  members: [
    { name: "Member One", registerNumber: "BIT002", department: "IT" }
  ],
  domainId: "AGR",
  domainName: "Agriculture & Rural Development",
  status: "ACTIVE",
  createdAt: "2026-09-10T00:00:00.000Z",
  selectionStatus: mockProblemConfig.selectionState,
  releaseAt: mockProblemConfig.releaseAt,
  closeAt: (typeof import.meta !== "undefined" && import.meta.env?.VITE_MOCK_CLOSE_AT) || "2026-09-15T13:30:00.000Z",
  problemsReleased: mockProblemConfig.selectionState !== "NOT_RELEASED",
  selection: null
};

const mockTeams = {
  "mock-leader1@bitsathy.ac.in": mockTeam,
  "mock-leader2@bitsathy.ac.in": {
    ...mockTeam,
    teamId: "BIT-AI-TEST-002",
    teamName: "Second Test Team",
    leaderEmail: "leader2@bitsathy.ac.in"
  },
  "mock-edu-leader@bitsathy.ac.in": {
    ...mockTeam,
    teamId: "BIT-AI-TEST-003",
    teamName: "Education Test Team",
    leaderEmail: "edu@bitsathy.ac.in",
    domainId: "EDU",
    domainName: "Education & Knowledge"
  }
};

const mockAdminEmail = "mock-admin@bitsathy.ac.in";
const mockAdminConfig = {
  registrationEnabled: "TRUE",
  registrationDeadline: "2026-09-12T12:00:00+05:30",
  problemReleaseAt: "2026-09-15T04:30:00.000Z",
  problemCloseAt: (typeof import.meta !== "undefined" && import.meta.env?.VITE_MOCK_CLOSE_AT) || "2026-09-15T13:30:00.000Z",
  selectionStatus: mockProblemConfig.selectionState === "OPEN" ? "OPEN" : "CLOSED"
};

let mockAllowSelectionReset = false;

function requireMockAdmin(idToken) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  if (idToken !== mockAdminEmail) return failure("ADMIN_REQUIRED", "Active administrator access is required.");
  return null;
}

function success(data) {
  return Promise.resolve({
    success: true,
    data
  });
}

function failure(code, error) {
  return Promise.resolve({
    success: false,
    code,
    error
  });
}

export function apiGetDomains() {
  return success(mockDomains);
}

export function apiGetTeam(idToken) {
  if (!idToken) {
    return failure("AUTH_REQUIRED", "Please sign in with your BIT college account.");
  }

  if (idToken === "mock-unregistered@bitsathy.ac.in") {
    return failure("TEAM_NOT_REGISTERED", "No registered team was found for this college account.");
  }

  if (idToken === "mock-outsider@example.com") {
    return failure("COLLEGE_EMAIL_REQUIRED", "Only @bitsathy.ac.in Google accounts are allowed.");
  }

  if (idToken === "mock-invalid-token") {
    return failure("INVALID_TOKEN", "Invalid or expired Google ID token.");
  }

  const currentTeam = mockTeams[idToken];
  if (!currentTeam) {
    return failure("INVALID_TOKEN", "Invalid or expired Google ID token.");
  }

  const selection = mockLockedSelections.get(currentTeam.teamId) || null;
  return success({
    ...currentTeam,
    selectionStatus: selection ? "LOCKED" : mockProblemConfig.selectionState,
    problemsReleased: mockProblemConfig.selectionState !== "NOT_RELEASED",
    selection
  });
}

export function apiSelectDomain(_idToken, dataOrDomainId) {
  const domainId = String(
    typeof dataOrDomainId === "object" && dataOrDomainId !== null
      ? dataOrDomainId.domainId || dataOrDomainId.DomainID
      : dataOrDomainId || ""
  ).trim().toUpperCase();

  const domain = mockDomains.find((d) => d.domainId === domainId);
  if (!domain) {
    return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  }

  if (domain.remainingCapacity <= 0) {
    return failure("DOMAIN_CAPACITY_REACHED", "The requested domain has reached its team capacity.");
  }

  if (mockSelectedDomain) {
    return failure("DOMAIN_ALREADY_SELECTED", "Domain has already been selected for this team.");
  }

  mockSelectedDomain = domainId;
  domain.currentLockedTeams += 1;
  domain.remainingCapacity = Math.max(0, domain.maximumTeams - domain.currentLockedTeams);
  domain.available = domain.remainingCapacity > 0;

  return success({
    teamId: "BIT-AI-001",
    domainId: domainId
  });
}

export function apiGetProblems(idToken) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");

  const state = String(mockProblemConfig.selectionState).toUpperCase();
  if (state === "NOT_RELEASED") {
    return success({ selectionState: state, releaseAt: mockProblemConfig.releaseAt });
  }
  if (state === "CLOSED") {
    return success({ selectionState: state, releaseAt: mockProblemConfig.releaseAt, problems: [] });
  }
  if (state === "LOCKED" || mockLockedSelections.has(currentTeam.teamId)) {
    return success({ selectionState: "LOCKED", releaseAt: mockProblemConfig.releaseAt, problems: [] });
  }

  return success({
    selectionState: "OPEN",
    releaseAt: mockProblemConfig.releaseAt,
    problems: mockProblemConfig.problems.filter((problem) =>
      problem.PSID !== "AGR-03" &&
      problem.Status !== "DISABLED" &&
      problem.DomainID === currentTeam.domainId &&
      ![...mockLockedSelections.values()].some((selection) => selection.psId === problem.PSID)
    )
  });
}

export function apiLockProblem(idToken, data) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");

  const psid = String(data?.psid || data?.psId || "").trim().toUpperCase();
  if (!psid) return failure("INVALID_REQUEST", "A problem identifier is required.");
  if (mockProblemConfig.selectionState !== "OPEN") return failure("SELECTION_CLOSED", "Problem selection is closed.");
  if (mockLockedSelections.has(currentTeam.teamId)) return failure("TEAM_ALREADY_LOCKED", "Your team has already locked a problem.");

  const problem = mockProblemConfig.problems.find((candidate) => candidate.PSID === psid);
  if (!problem) return failure("INVALID_PROBLEM", "The requested problem was not found.");
  if (problem.PSID === "AGR-03") return failure("PROBLEM_DISABLED", "The requested problem is not available.");
  if (problem.DomainID !== currentTeam.domainId) return failure("WRONG_DOMAIN", "The requested problem is not available for your registered domain.");
  if ([...mockLockedSelections.values()].some((selection) => selection.psId === psid)) {
    return failure("PROBLEM_ALREADY_LOCKED", "This problem has already been locked by another team.");
  }

  const selection = {
    teamId: currentTeam.teamId,
    domainId: currentTeam.domainId,
    psId: psid,
    selectedAt: new Date().toISOString(),
    status: "LOCKED",
    problem: {
      title: problem.Title,
      description: problem.Description,
      whatToBuild: problem.WhatToBuild
    }
  };
  mockLockedSelections.set(currentTeam.teamId, selection);
  return success(selection);
}

let mockRegistrationEnabled = true;
let mockRegistrationDeadline = "2026-09-12T12:00:00+05:30";

function isMockRegistrationOpen() {
  if (!mockRegistrationEnabled) return false;
  if (mockRegistrationDeadline) {
    const deadline = new Date(mockRegistrationDeadline);
    if (!isNaN(deadline.getTime()) && Date.now() >= deadline.getTime()) {
      return false;
    }
  }
  return true;
}

export function apiRegisterTeam(idToken, data) {
  if (!isMockRegistrationOpen()) {
    return failure("REGISTRATION_CLOSED", "Registration has closed.");
  }

  if (!idToken) {
    return failure("AUTH_REQUIRED", "Authentication is required before registering a team.");
  }

  if (!data) {
    return failure("INVALID_TEAM_DATA", "Registration data is required.");
  }

  // Validate Team Leader Mobile
  const mobileInput = String(data.leaderMobile || "").trim();
  let cleanedMobile = mobileInput.replace(/[\s\-()]/g, "");
  if (cleanedMobile.startsWith("+91")) cleanedMobile = cleanedMobile.substring(3);
  else if (cleanedMobile.length === 12 && cleanedMobile.startsWith("91")) cleanedMobile = cleanedMobile.substring(2);
  else if (cleanedMobile.length === 11 && cleanedMobile.startsWith("0")) cleanedMobile = cleanedMobile.substring(1);

  if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
    return failure(
      "INVALID_MOBILE_NUMBER",
      "Leader mobile number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."
    );
  }

  // Members array validation (1 to 3 members -> 2 to 4 total)
  const members = data.members || [];
  if (!Array.isArray(members) || members.length < 1 || members.length > 3) {
    return failure("INVALID_TEAM_DATA", "A team must have between 2 and 4 members total including the leader.");
  }

  // Duplicate register numbers check inside submission
  const submittedRegs = [
    String(data.leaderRegisterNumber || "").trim().toUpperCase(),
    ...members.map((m) => String(m.registerNumber || "").trim().toUpperCase())
  ].filter(Boolean);

  if (new Set(submittedRegs).size !== submittedRegs.length) {
    return failure("DUPLICATE_REGISTER_NUMBER", "The same register number cannot appear more than once in a team.");
  }

  // Existing duplicates check
  const leaderEmail = String(data.leaderEmail || "").trim().toLowerCase();
  if (leaderEmail && mockRegisteredLeaderEmails.has(leaderEmail)) {
    return failure("TEAM_ALREADY_REGISTERED", "This team leader email is already registered.");
  }

  for (const reg of submittedRegs) {
    if (mockRegisteredRegNumbers.has(reg)) {
      return failure("DUPLICATE_REGISTER_NUMBER", `Register number ${reg} is already registered in another team.`);
    }
  }

  // Domain check
  const domainId = String(data.domainId || "").trim().toUpperCase();
  if (!domainId) {
    return failure("DOMAIN_REQUIRED", "Domain selection is required.");
  }

  const domain = mockDomains.find((d) => d.domainId === domainId);
  if (!domain) {
    return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  }

  if (domain.remainingCapacity <= 0) {
    return failure("DOMAIN_CAPACITY_REACHED", "The requested domain has reached its team capacity.");
  }

  // Deduct domain capacity
  domain.currentLockedTeams += 1;
  domain.remainingCapacity = Math.max(0, domain.maximumTeams - domain.currentLockedTeams);
  domain.available = domain.remainingCapacity > 0;

  // Track mock registered data
  if (leaderEmail) mockRegisteredLeaderEmails.add(leaderEmail);
  submittedRegs.forEach((r) => mockRegisteredRegNumbers.add(r));

  mockTeamCounter += 1;
  const teamId = "BIT-AI-" + String(mockTeamCounter).padStart(3, "0");

  return success({
    teamId: teamId,
    teamName: String(data.teamName || "").trim(),
    domainId: domainId,
    domainName: domain.domainName,
    status: "ACTIVE"
  });
}

export function apiGetMySelection(idToken) {
  const currentTeam = mockTeams[idToken];
  const selection = currentTeam ? mockLockedSelections.get(currentTeam.teamId) || null : null;
  return success({
    hasSelection: selection !== null,
    selection
  });
}

export function apiSelectProblem() {
  return failure("PROBLEMS_NOT_RELEASED", "Problem selection is not available in the local Phase 5 mock.");
}

export function apiAdminGetStats() {
  const denied = requireMockAdmin(arguments[0]);
  if (denied) return denied;
  return success({
    registeredTeams: Object.keys(mockTeams).length,
    activeTeams: Object.keys(mockTeams).length,
    disabledTeams: 0,
    lockedSelections: mockLockedSelections.size,
    pendingTeams: Math.max(Object.keys(mockTeams).length - mockLockedSelections.size, 0),
    totalProblems: mockProblemConfig.problems.length,
    activeProblems: mockProblemConfig.problems.filter((problem) => problem.Status !== "DISABLED").length,
    disabledProblems: mockProblemConfig.problems.filter((problem) => problem.Status === "DISABLED").length,
    availableProblems: mockProblemConfig.problems.filter((problem) => problem.Status !== "DISABLED" && ![...mockLockedSelections.values()].some((selection) => selection.psId === problem.PSID)).length,
    totalActiveDomains: 4,
    domains: mockDomains,
    selectionStatus: mockProblemConfig.selectionState === "OPEN" ? "OPEN" : "CLOSED",
    hackathonStatus: "REGISTRATION_OPEN",
    problemReleaseAt: mockAdminConfig.problemReleaseAt,
    problemCloseAt: mockAdminConfig.problemCloseAt,
    selectionState: mockProblemConfig.selectionState,
    problemsReleased: mockProblemConfig.selectionState !== "NOT_RELEASED"
  });
}

export function apiAdminGetConfiguration(idToken) {
  const denied = requireMockAdmin(idToken);
  return denied || success({ ...mockAdminConfig, selectionState: mockProblemConfig.selectionState, allowSelectionReset: mockAllowSelectionReset });
}

export function apiAdminUpdateConfiguration(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const release = new Date(data?.problemReleaseAt);
  const close = new Date(data?.problemCloseAt);
  if (Number.isNaN(release.getTime()) || Number.isNaN(close.getTime()) || close <= release) return failure("INVALID_CONFIGURATION", "Close time must be after release time.");
  mockAdminConfig.problemReleaseAt = release.toISOString();
  mockAdminConfig.problemCloseAt = close.toISOString();
  return success({ ...mockAdminConfig });
}

export function apiAdminGetTeams(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  return success(Object.values(mockTeams).map((team) => ({ TeamID: team.teamId, TeamName: team.teamName, LeaderName: team.leaderName, DomainID: team.domainId, Status: team.status, Selection: mockLockedSelections.get(team.teamId) || null })));
}

export function apiAdminAddTeam(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  if (!data?.teamName || !data?.leaderEmail || !data?.leaderRegisterNumber) return failure("INVALID_TEAM_DATA", "Team and leader fields are required.");
  const email = String(data.leaderEmail).toLowerCase();
  if (Object.values(mockTeams).some((team) => team.leaderEmail === email)) return failure("TEAM_ALREADY_REGISTERED", "This team leader email is already registered.");
  const teamId = `BIT-AI-TEST-${String(++mockTeamCounter).padStart(3, "0")}`;
  const domain = mockDomains.find((item) => item.domainId === String(data.domainId || "").toUpperCase());
  if (!domain) return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  const team = { teamId, teamName: data.teamName, leaderName: data.leaderName, leaderEmail: email, leaderMobile: data.leaderMobile, leaderRegisterNumber: data.leaderRegisterNumber, leaderDepartment: data.leaderDepartment, members: data.members || [], domainId: domain.domainId, domainName: domain.domainName, status: "ACTIVE", createdAt: new Date().toISOString(), selection: null };
  mockTeams[email] = team;
  return success({ teamId, teamName: team.teamName, domainId: team.domainId, status: team.status });
}

export function apiAdminUpdateTeam(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const team = Object.values(mockTeams).find((item) => item.teamId === (data?.TeamID || data?.teamId));
  if (!team) return failure("TEAM_NOT_FOUND", "The requested team was not found.");
  const locked = mockLockedSelections.get(team.teamId);
  if (locked && data.domainId && data.domainId !== team.domainId) return failure("TEAM_ALREADY_ALLOCATED", "A team with a locked problem cannot change domain.");
  Object.assign(team, { teamName: data.teamName, leaderName: data.leaderName, leaderEmail: data.leaderEmail, leaderMobile: data.leaderMobile, leaderRegisterNumber: data.leaderRegisterNumber, leaderDepartment: data.leaderDepartment, domainId: data.domainId, members: data.members || team.members });
  return success({ ...team, TeamID: team.teamId, TeamName: team.teamName, DomainID: team.domainId });
}

export function apiAdminEnableTeam(_idToken, data) {
  return success({ teamId: data && (data.teamId || data.TeamID), status: "ACTIVE" });
}

export function apiAdminDisableTeam(_idToken, data) {
  return success({ teamId: data && (data.teamId || data.TeamID), status: "DISABLED" });
}

export function apiAdminGetProblems() {
  const denied = requireMockAdmin(arguments[0]);
  if (denied) return denied;
  return success(mockProblemConfig.problems.map((problem) => ({
    ...problem,
    Status: problem.Status || (problem.PSID === "AGR-03" ? "DISABLED" : "ACTIVE")
  })));
}

export function apiAdminAddProblem(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const domainId = String(data?.domainId || "").toUpperCase();
  if (!mockDomains.some((domain) => domain.domainId === domainId)) return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  if (!data?.title || !data?.description || !data?.whatToBuild) return failure("INVALID_PROBLEM_DATA", "Problem fields are required.");
  const psId = `${domainId}-${String(mockProblemConfig.problems.length + 1).padStart(2, "0")}`;
  const problem = { PSID: psId, DomainID: domainId, Title: data.title, Description: data.description, WhatToBuild: data.whatToBuild };
  mockProblemConfig.problems.push(problem);
  return success(problem);
}

export function apiAdminUpdateProblem(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const problem = mockProblemConfig.problems.find((item) => item.PSID === String(data?.psId || "").toUpperCase());
  if (!problem) return failure("PROBLEM_NOT_FOUND", "The requested problem was not found.");
  Object.assign(problem, { Title: data.title, Description: data.description, WhatToBuild: data.whatToBuild });
  return success(problem);
}

export function apiAdminEnableProblem(_idToken, data) {
  return success({ psId: data && data.psId, status: "ACTIVE" });
}

export function apiAdminDisableProblem(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const problem = mockProblemConfig.problems.find((item) => item.PSID === String(data?.psId || "").toUpperCase());
  if (!problem) return failure("PROBLEM_NOT_FOUND", "The requested problem was not found.");
  problem.Status = "DISABLED";
  return success({ ...problem, status: "DISABLED" });
}

export function apiAdminGetDomains(idToken) {
  const denied = requireMockAdmin(idToken);
  return denied || success(mockDomains);
}

export function apiAdminUpdateDomain(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const domain = mockDomains.find((item) => item.domainId === String(data?.domainId || data?.DomainID || "").toUpperCase());
  if (!domain) return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  const maximumTeams = Number(data.maximumTeams);
  if (!Number.isInteger(maximumTeams) || maximumTeams < domain.currentLockedTeams) return failure("CAPACITY_BELOW_USAGE", "Capacity cannot be lower than current usage.");
  Object.assign(domain, { maximumTeams, remainingCapacity: maximumTeams - domain.currentLockedTeams, available: data.status === "ACTIVE" && maximumTeams > domain.currentLockedTeams, domainName: data.domainName, status: data.status });
  return success(domain);
}

export function apiAdminReleaseNow(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  mockProblemConfig.selectionState = "OPEN";
  mockAdminConfig.selectionStatus = "OPEN";
  return success({ problemsReleased: true, selectionState: "OPEN" });
}

export function apiAdminCloseSelection(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  mockProblemConfig.selectionState = "CLOSED";
  mockAdminConfig.selectionStatus = "CLOSED";
  return success({ selectionStatus: "CLOSED", selectionState: "CLOSED" });
}

export function apiAdminOpenSelection(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  mockProblemConfig.selectionState = "OPEN";
  mockAdminConfig.selectionStatus = "OPEN";
  return success({ selectionStatus: "OPEN", selectionState: "OPEN" });
}

export function apiAdminSetAllowReset(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const flag = String(
    data && (data.allowSelectionReset !== undefined ? data.allowSelectionReset : data.flag) || ""
  ).trim().toUpperCase();
  if (flag !== "TRUE" && flag !== "FALSE") {
    return failure("INVALID_CONFIGURATION", "ALLOW_SELECTION_RESET must be TRUE or FALSE.");
  }
  mockAllowSelectionReset = flag === "TRUE";
  return success({ allowSelectionReset: mockAllowSelectionReset });
}

export function apiAdminRemoveTeamSelection(idToken, data) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  if (!mockAllowSelectionReset) {
    return failure("RESET_NOT_ALLOWED", "Selection reset is not currently allowed. Set ALLOW_SELECTION_RESET = TRUE in Config to enable.");
  }
  const teamId = String(data && (data.teamId || data.TeamID) || "").trim();
  if (!teamId) return failure("INVALID_REQUEST", "TeamID is required.");
  const removed = mockLockedSelections.delete(teamId) ? 1 : 0;
  return success({ teamId, removed });
}

export function apiAdminRemoveAllSelections(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  if (!mockAllowSelectionReset) {
    return failure("RESET_NOT_ALLOWED", "Selection reset is not currently allowed. Set ALLOW_SELECTION_RESET = TRUE in Config to enable.");
  }
  const removed = mockLockedSelections.size;
  mockLockedSelections.clear();
  return success({ removed });
}

export function apiAdminGetSelections(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  return success([...mockLockedSelections.values()]);
}

const mockFeedbacks = new Map();
const mockFinalSubmissions = new Map();

export function apiSubmitFeedback(idToken, data) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");
  if (currentTeam.status !== "ACTIVE") return failure("TEAM_DISABLED", "This team is currently disabled.");

  const feedbackText = String(data?.feedback || "").trim();
  if (!feedbackText) return failure("INVALID_FEEDBACK", "Feedback cannot be empty.");
  if (feedbackText.length > 2000) return failure("INVALID_FEEDBACK", "Feedback exceeds maximum length of 2000 characters.");

  if (mockFeedbacks.has(currentTeam.teamId)) {
    return failure("FEEDBACK_ALREADY_SUBMITTED", "Feedback has already been submitted for this team.");
  }

  const entry = {
    teamId: currentTeam.teamId,
    teamName: currentTeam.teamName,
    domain: currentTeam.domainId,
    feedback: feedbackText
  };
  mockFeedbacks.set(currentTeam.teamId, entry);

  return Promise.resolve({
    success: true,
    message: "Feedback submitted successfully."
  });
}

export function apiGetMyFeedbackStatus(idToken) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");

  return Promise.resolve({
    success: true,
    submitted: mockFeedbacks.has(currentTeam.teamId)
  });
}

export function apiAdminGetFeedback(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;

  return Promise.resolve({
    success: true,
    feedback: [...mockFeedbacks.values()]
  });
}

export function apiSubmitFinalSubmission(idToken, data) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");
  if (currentTeam.status !== "ACTIVE") return failure("TEAM_DISABLED", "This team is currently disabled.");

  const selection = mockLockedSelections.get(currentTeam.teamId);
  if (!selection || !selection.psId) {
    return failure("NO_PROBLEM_SELECTED", "Your team has not selected a problem statement yet.");
  }

  const feedbackText = String(data?.feedback || "").trim();
  if (!feedbackText) return failure("INVALID_FINAL_SUBMISSION", "Feedback cannot be empty.");
  if (feedbackText.length > 5000) return failure("INVALID_FINAL_SUBMISSION", "Feedback exceeds maximum length of 5000 characters.");

  if (mockFinalSubmissions.has(currentTeam.teamId)) {
    return failure("FINAL_SUBMISSION_ALREADY_SUBMITTED", "Your team has already submitted the final submission.");
  }

  const entry = {
    teamId: currentTeam.teamId,
    teamName: currentTeam.teamName,
    psId: selection.psId,
    teamLeadName: currentTeam.leaderName,
    teamLeadEmail: currentTeam.leaderEmail,
    feedback: feedbackText
  };
  mockFinalSubmissions.set(currentTeam.teamId, entry);

  return Promise.resolve({
    success: true,
    message: "Final submission submitted successfully."
  });
}

export function apiGetMyFinalSubmissionStatus(idToken) {
  if (!idToken) return failure("AUTH_REQUIRED", "Authentication is required.");
  const currentTeam = mockTeams[idToken];
  if (!currentTeam) return failure("TEAM_NOT_REGISTERED", "No registered team was found.");

  return Promise.resolve({
    success: true,
    submitted: mockFinalSubmissions.has(currentTeam.teamId)
  });
}

export function apiAdminGetFinalSubmissions(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;

  return Promise.resolve({
    success: true,
    finalSubmissions: [...mockFinalSubmissions.values()]
  });
}

export function apiAdminGetAllData(idToken) {
  const denied = requireMockAdmin(idToken);
  if (denied) return denied;
  const statsRes = apiAdminGetStats(idToken);
  const teamsRes = apiAdminGetTeams(idToken);
  const probsRes = apiAdminGetProblems(idToken);
  const domsRes = apiAdminGetDomains(idToken);
  const cfgRes = apiAdminGetConfiguration(idToken);
  const selsRes = apiAdminGetSelections(idToken);
  const fbkRes = apiAdminGetFeedback(idToken);
  const finalSubRes = apiAdminGetFinalSubmissions(idToken);

  return Promise.all([statsRes, teamsRes, probsRes, domsRes, cfgRes, selsRes, fbkRes, finalSubRes]).then(([s, t, p, d, c, sel, fbk, fsub]) => {
    return success({
      stats: s.data,
      teams: t.data,
      problems: p.data,
      domains: d.data,
      config: c.data,
      selections: sel.data || [],
      feedback: fbk.feedback || [],
      finalSubmissions: fsub.finalSubmissions || []
    });
  });
}
