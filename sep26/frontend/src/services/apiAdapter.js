/**
 * apiAdapter.js — Canonical Data Normalization Layer
 *
 * Ensures all API responses (from Apps Script or mock) are converted to consistent,
 * camelCase property names across the frontend application.
 */

const DOMAIN_NAME_MAP = {
  AGR: "Agriculture & Rural Development",
  EMP: "Skills, Employment & Entrepreneurship",
  EDU: "Education & Knowledge",
  GOV: "Government & Public Services"
};

export function normalizeDomainId(rawDomain) {
  const text = String(rawDomain || "").trim().toUpperCase();
  if (!text) return "";
  if (text === "AGR" || text.includes("AGRICULTUR")) return "AGR";
  if (text === "EMP" || text.includes("SKILL") || text.includes("EMPLOY")) return "EMP";
  if (text === "EDU" || text.includes("EDUCAT") || text.includes("KNOWLEDG")) return "EDU";
  if (text === "GOV" || text.includes("GOVERN") || text.includes("PUBLIC")) return "GOV";
  return text;
}

export function normalizeSelection(selection) {
  if (!selection) return null;
  const rawDomain = selection.domainId || selection.DomainID || "";
  const domainId = normalizeDomainId(rawDomain);
  const domainName = selection.domainName || selection.DomainName || DOMAIN_NAME_MAP[domainId] || String(rawDomain).trim();

  return {
    teamId: String(selection.teamId || selection.TeamID || "").trim(),
    teamName: String(selection.teamName || selection.TeamName || "").trim(),
    domainId: domainId,
    domainName: domainName,
    psId: String(selection.psId || selection.PSID || "").trim().toUpperCase(),
    problemTitle: String(
      selection.problemTitle ||
      selection.Title ||
      (selection.problem && selection.problem.title) ||
      ""
    ).trim(),
    selectedAt: selection.selectedAt || selection.SelectedAt || null,
    status: String(selection.status || selection.Status || "LOCKED").trim().toUpperCase()
  };
}

export function normalizeTeam(team) {
  if (!team) return null;
  const members = (team.members || team.Members || []).map(m => ({
    name: String(m.name || m.MemberName || "").trim(),
    registerNumber: String(m.registerNumber || m.RegisterNumber || "").trim(),
    department: String(m.department || m.Department || "").trim()
  }));

  const rawSelection = team.selection || team.Selection || null;
  const rawDomain = team.domainId || team.DomainID || "";
  const domainId = normalizeDomainId(rawDomain);
  const domainName = team.domainName || team.DomainName || DOMAIN_NAME_MAP[domainId] || String(rawDomain).trim();

  return {
    teamId: String(team.teamId || team.TeamID || "").trim(),
    teamName: String(team.teamName || team.TeamName || "").trim(),
    leaderName: String(team.leaderName || team.LeaderName || "").trim(),
    leaderEmail: String(team.leaderEmail || team.LeaderEmail || "").trim().toLowerCase(),
    leaderMobile: String(team.leaderMobile || team.LeaderMobile || team.LeaderMobileNumber || "").trim(),
    leaderRegisterNumber: String(team.leaderRegisterNumber || team.LeaderRegisterNumber || "").trim(),
    leaderDepartment: String(team.leaderDepartment || team.LeaderDepartment || "").trim(),
    domainId: domainId,
    domainName: domainName,
    status: String(team.status || team.Status || "ACTIVE").trim().toUpperCase(),
    createdAt: team.createdAt || team.CreatedAt || null,
    members: members,
    selection: normalizeSelection(rawSelection)
  };
}

export function normalizeProblem(problem) {
  if (!problem) return null;
  const rawDomain = problem.domainId || problem.DomainID || "";
  const domainId = normalizeDomainId(rawDomain);
  const domainName = DOMAIN_NAME_MAP[domainId] || String(rawDomain).trim();

  return {
    psId: String(problem.psId || problem.PSID || "").trim().toUpperCase(),
    domainId: domainId,
    domainName: domainName,
    title: String(problem.title || problem.Title || "").trim(),
    description: String(problem.description || problem.Description || "").trim(),
    whatToBuild: String(problem.whatToBuild || problem.WhatToBuild || "").trim(),
    status: String(problem.status || problem.Status || "ACTIVE").trim().toUpperCase()
  };
}

export function normalizeDomain(domain) {
  if (!domain) return null;
  const rawDomain = domain.domainId || domain.DomainID || "";
  const domainId = normalizeDomainId(rawDomain);
  const domainName = domain.domainName || domain.DomainName || DOMAIN_NAME_MAP[domainId] || String(rawDomain).trim();

  const maximumTeams = Number(domain.maximumTeams || domain.MaximumTeams || 0);
  const lockedTeams = Number(
    domain.lockedTeams !== undefined ? domain.lockedTeams : (domain.currentLockedTeams !== undefined ? domain.currentLockedTeams : domain.CurrentLockedTeams || 0)
  );
  const registeredTeams = Number(
    domain.registeredTeams !== undefined ? domain.registeredTeams : (domain.RegisteredTeams || 0)
  );
  const status = String(domain.status || domain.Status || "ACTIVE").trim().toUpperCase();

  return {
    domainId: domainId,
    domainName: domainName,
    maximumTeams: maximumTeams,
    registeredTeams: registeredTeams,
    lockedTeams: lockedTeams,
    currentLockedTeams: lockedTeams,
    remainingCapacity: Number(domain.remainingCapacity !== undefined ? domain.remainingCapacity : Math.max(maximumTeams - lockedTeams, 0)),
    status: status,
    available: domain.available !== undefined ? Boolean(domain.available) : (status === "ACTIVE" && lockedTeams < maximumTeams)
  };
}

export function normalizeStats(stats) {
  if (!stats) return null;
  const rawDomains = stats.domains || stats.Domains || [];
  return {
    registeredTeams: Number(stats.registeredTeams !== undefined ? stats.registeredTeams : (stats.registeredTeamsCount || 0)),
    activeTeams: Number(stats.activeTeams !== undefined ? stats.activeTeams : 0),
    disabledTeams: Number(stats.disabledTeams !== undefined ? stats.disabledTeams : 0),
    pendingTeams: Number(stats.pendingTeams !== undefined ? stats.pendingTeams : 0),
    lockedSelections: Number(stats.lockedSelections !== undefined ? stats.lockedSelections : 0),
    totalProblems: Number(stats.totalProblems !== undefined ? stats.totalProblems : 0),
    activeProblems: Number(stats.activeProblems !== undefined ? stats.activeProblems : 0),
    disabledProblems: Number(stats.disabledProblems !== undefined ? stats.disabledProblems : 0),
    availableProblems: Number(stats.availableProblems !== undefined ? stats.availableProblems : 0),
    totalActiveDomains: Number(stats.totalActiveDomains !== undefined ? stats.totalActiveDomains : rawDomains.length),
    domains: rawDomains.map(normalizeDomain),
    selectionStatus: String(stats.selectionStatus || stats.selectionState || "CLOSED").trim().toUpperCase(),
    problemReleaseAt: stats.problemReleaseAt || null,
    problemCloseAt: stats.problemCloseAt || null
  };
}

export function normalizeConfig(config) {
  if (!config) return null;
  const regEnabledRaw = config.registrationEnabled !== undefined ? config.registrationEnabled : config.REGISTRATION_ENABLED;
  const allowResetRaw = config.allowSelectionReset !== undefined ? config.allowSelectionReset : (config.allowResetSelection !== undefined ? config.allowResetSelection : config.ALLOW_SELECTION_RESET);

  return {
    registrationEnabled: String(regEnabledRaw).trim().toUpperCase() === "TRUE" || regEnabledRaw === true,
    registrationDeadline: config.registrationDeadline || config.REGISTRATION_DEADLINE || null,
    problemReleaseAt: config.problemReleaseAt || config.ProblemReleaseAt || null,
    problemCloseAt: config.problemCloseAt || config.PROBLEM_CLOSE_DATETIME || config.ProblemCloseAt || null,
    selectionStatus: String(config.selectionStatus || config.SelectionStatus || config.selectionState || "CLOSED").trim().toUpperCase(),
    allowSelectionReset: String(allowResetRaw).trim().toUpperCase() === "TRUE" || allowResetRaw === true
  };
}
