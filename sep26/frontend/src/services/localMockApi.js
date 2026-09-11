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

const mockProblems = {
  AGR: [
    {
      PSID: "AGR-01",
      Title: "Smart Crop Planning",
      Description: "Create a tool that helps small farms plan seasonal crops.",
      WhatToBuild: "Build a crop planning dashboard.",
      DomainID: "AGR"
    }
  ],
  EMP: [],
  EDU: [],
  GOV: []
};

let mockSelection = null;
let mockSelectedDomain = null;
let mockTeamCounter = 0;

const mockRegisteredLeaderEmails = new Set();
const mockRegisteredRegNumbers = new Set();

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

function selectionFor(problem) {
  return {
    teamId: "BIT-AI-001",
    domainId: problem.DomainID,
    psId: problem.PSID,
    selectedAt: "2026-09-10T00:00:00.000Z",
    status: "LOCKED",
    problem: {
      title: problem.Title,
      description: problem.Description,
      whatToBuild: problem.WhatToBuild
    }
  };
}

export function apiGetDomains() {
  return success(mockDomains);
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

export function apiGetProblems(_idToken, data) {
  const domainId = String(data && data.domainId || "").trim().toUpperCase();
  const problems = mockProblems[domainId];

  if (!problems) {
    return failure("DOMAIN_NOT_FOUND", "The requested domain was not found.");
  }

  return success(problems);
}

let mockRegistrationEnabled = true;
let mockRegistrationDeadline = "2026-09-12T20:00:00+05:30";

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

export function apiGetMySelection() {
  return success({
    hasSelection: mockSelection !== null,
    selection: mockSelection
  });
}

export function apiSelectProblem(_idToken, data) {
  if (mockSelection) {
    return failure(
      "TEAM_ALREADY_HAS_SELECTION",
      "This team already has a locked problem."
    );
  }

  const domainId = String(data && data.domainId || "").trim().toUpperCase();
  const psId = String(data && data.psId || "").trim().toUpperCase();
  const problem = (mockProblems[domainId] || []).find(function(candidate) {
    return candidate.PSID === psId;
  });

  if (!problem) {
    return failure("PROBLEM_NOT_FOUND", "The requested problem was not found.");
  }

  mockSelection = selectionFor(problem);
  return success(mockSelection);
}

export function apiAdminGetStats() {
  return success({
    registeredTeams: 1,
    activeTeams: 1,
    disabledTeams: 0,
    lockedSelections: mockSelection ? 1 : 0,
    pendingTeams: mockSelection ? 0 : 1,
    totalProblems: 3,
    activeProblems: 3,
    disabledProblems: 0,
    availableProblems: 3,
    totalActiveDomains: 2,
    domains: mockDomains,
    selectionStatus: "OPEN",
    hackathonStatus: "REGISTRATION_OPEN",
    problemReleaseDate: "2026-09-10",
    problemReleaseTime: "10:30",
    problemsReleased: true
  });
}

export function apiAdminGetTeams() {
  return success([]);
}

export function apiAdminAddTeam() {
  return success({ teamId: "BIT-AI-DEV-002" });
}

export function apiAdminUpdateTeam() {
  return success({ teamId: "BIT-AI-001" });
}

export function apiAdminEnableTeam(_idToken, data) {
  return success({ teamId: data && (data.teamId || data.TeamID), status: "ACTIVE" });
}

export function apiAdminDisableTeam(_idToken, data) {
  return success({ teamId: data && (data.teamId || data.TeamID), status: "DISABLED" });
}

export function apiAdminGetProblems() {
  return success(Object.values(mockProblems).flat());
}

export function apiAdminAddProblem() {
  return success({ psId: "AGR-03" });
}

export function apiAdminUpdateProblem(_idToken, data) {
  return success({ psId: data && (data.psId || data.PSID) });
}

export function apiAdminEnableProblem(_idToken, data) {
  return success({ psId: data && (data.psId || data.PSID), status: "ACTIVE" });
}

export function apiAdminDisableProblem(_idToken, data) {
  return success({ psId: data && (data.psId || data.PSID), status: "DISABLED" });
}

export function apiAdminGetDomains() {
  return success(mockDomains);
}

export function apiAdminUpdateDomain(_idToken, data) {
  return success({ domainId: data && (data.domainId || data.DomainID) });
}

export function apiAdminReleaseNow() {
  return success({ problemsReleased: true });
}

export function apiAdminCloseSelection() {
  return success({ selectionStatus: "CLOSED" });
}

export function apiAdminOpenSelection() {
  return success({ selectionStatus: "OPEN" });
}
