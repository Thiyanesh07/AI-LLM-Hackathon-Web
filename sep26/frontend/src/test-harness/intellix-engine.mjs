import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-fixtures/intellix-test-data.json");
const copy = (value) => JSON.parse(JSON.stringify(value));
const ok = (data) => ({ success: true, data });
const fail = (code, error = code) => ({ success: false, code, error });

export const IDS = { admin: "admin.test@bitsathy.ac.in", student: "student.test@bitsathy.ac.in", agr: "leader.agr@bitsathy.ac.in", edu: "leader.edu@bitsathy.ac.in", agr2: "leader.agr2@bitsathy.ac.in", outsider: "user@gmail.com", invalid: "INVALID_TOKEN" };

export function createTestEngine() {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  let state;
  let simulatedNow = new Date("2026-09-11T09:00:00+05:30");
  let forcedState = null;
  const resetTestState = () => { state = copy(fixture); simulatedNow = new Date("2026-09-11T09:00:00+05:30"); forcedState = null; return state; };
  const teamFor = (token) => state.teams.find((team) => team.leaderEmail === token && team.status === "ACTIVE");
  const adminFor = (token) => state.admins.find((admin) => admin.email === token && admin.status === "ACTIVE");
  const requireTeam = (token) => { if (!token) return fail("AUTH_REQUIRED"); if (token === IDS.invalid) return fail("INVALID_TOKEN"); if (token === IDS.outsider) return fail("COLLEGE_EMAIL_REQUIRED"); const team = teamFor(token); return team ? ok(team) : fail("TEAM_NOT_REGISTERED"); };
  const requireAdmin = (token) => adminFor(token) ? null : fail(token ? "ADMIN_REQUIRED" : "AUTH_REQUIRED");
  const getReleaseAt = () => {
    if (state.config.problemReleaseDateTime) return state.config.problemReleaseDateTime;
    if (state.config.ProblemReleaseDate && state.config.ProblemReleaseTime) {
      return `${state.config.ProblemReleaseDate}T${state.config.ProblemReleaseTime}+05:30`;
    }
    return "2026-09-11T10:00:00+05:30";
  };
  const getCloseAt = () => {
    return state.config.PROBLEM_CLOSE_DATETIME || state.config.problemCloseDateTime || "2026-09-11T18:00:00+05:30";
  };
  const getSelectionState = () => {
    if (forcedState) return forcedState;
    const now = simulatedNow.getTime();
    if (now < new Date(getReleaseAt()).getTime()) return "NOT_RELEASED";
    if (now >= new Date(getCloseAt()).getTime()) return "SELECTION_CLOSED";
    return "SELECTION_OPEN";
  };
  const setTime = (value) => { simulatedNow = new Date(value); };
  const selectionForTeam = (teamId) => state.selections.find((selection) => selection.teamId === teamId && selection.status === "LOCKED");
  function getProblems(token, request = {}) {
    const auth = requireTeam(token); if (!auth.success) return auth; const team = auth.data; const selection = selectionForTeam(team.teamId); const selectionState = getSelectionState();
    const domain = state.domains.find((item) => item.domainId === team.domainId);
    if (!domain || domain.status !== "ACTIVE") return fail("DOMAIN_DISABLED", "The requested domain is disabled.");
    if (selection || selectionState !== "SELECTION_OPEN") return ok({ selectionState: selection ? "LOCKED" : selectionState, problems: [], releaseAt: getReleaseAt() });
    const locked = new Set(state.selections.filter((item) => item.status === "LOCKED").map((item) => item.psid));
    void request;
    return ok({ selectionState, releaseAt: getReleaseAt(), problems: state.problems.filter((problem) => problem.domainId === team.domainId && problem.status === "ACTIVE" && !locked.has(problem.psid)).map((problem) => ({ PSID: problem.psid, DomainID: problem.domainId, Title: problem.title, Description: problem.description, WhatToBuild: problem.whatToBuild })) });
  }
  function lockProblem(token, request = {}) {
    const auth = requireTeam(token); if (!auth.success) return auth; const team = auth.data; const psid = String(request.psid || request.psId || "").trim().toUpperCase();
    if (!psid) return fail("INVALID_REQUEST"); if (getSelectionState() !== "SELECTION_OPEN") return fail("SELECTION_CLOSED"); if (selectionForTeam(team.teamId)) return fail("TEAM_ALREADY_LOCKED");
    const problem = state.problems.find((item) => item.psid === psid); if (!problem) return fail("INVALID_PROBLEM"); if (problem.status !== "ACTIVE") return fail("PROBLEM_DISABLED"); if (problem.domainId !== team.domainId) return fail("WRONG_DOMAIN"); if (state.selections.some((item) => item.psid === psid && item.status === "LOCKED")) return fail("PROBLEM_ALREADY_LOCKED");
    const selection = { teamId: team.teamId, domainId: team.domainId, psid, selectedAt: simulatedNow.toISOString(), status: "LOCKED" }; state.selections.push(selection); return ok(selection);
  }
  const getTeam = (token) => { const auth = requireTeam(token); if (!auth.success) return auth; const selection = selectionForTeam(auth.data.teamId); return ok({ ...auth.data, selectionStatus: selection ? "LOCKED" : getSelectionState(), selection: selection || null }); };
  const adminMutation = (token, operation) => { const denied = requireAdmin(token); return denied || operation(); };
  const adminTeams = (token, query = "") => adminMutation(token, () => ok(state.teams.filter((team) => `${team.teamId} ${team.teamName} ${team.leaderEmail} ${team.domainId}`.toLowerCase().includes(String(query).toLowerCase()))));
  const adminProblems = (token, filters = {}) => adminMutation(token, () => ok(state.problems.filter((problem) => (!filters.query || `${problem.psid} ${problem.title} ${problem.description}`.toLowerCase().includes(filters.query.toLowerCase())) && (!filters.domainId || problem.domainId === filters.domainId) && (!filters.status || problem.status === filters.status))));
  const addTeam = (token, data) => adminMutation(token, () => { if (!data?.teamId || !data?.teamName || !data?.leaderEmail) return fail("INVALID_TEAM_DATA"); if (!state.domains.some((domain) => domain.domainId === data.domainId)) return fail("DOMAIN_NOT_FOUND"); const team = { ...data, status: "ACTIVE", members: data.members || [] }; state.teams.push(team); return ok(team); });
  const updateTeam = (token, data) => adminMutation(token, () => { const team = state.teams.find((item) => item.teamId === data.teamId); if (!team) return fail("TEAM_NOT_FOUND"); Object.assign(team, data); return ok(team); });
  const addProblem = (token, data) => adminMutation(token, () => { if (state.problems.some((item) => item.psid === data.psid)) return fail("PROBLEM_EXISTS"); const problem = { ...data, status: data.status || "ACTIVE" }; state.problems.push(problem); return ok(problem); });
  const updateProblem = (token, data) => adminMutation(token, () => { const problem = state.problems.find((item) => item.psid === data.psid); if (!problem) return fail("PROBLEM_NOT_FOUND"); Object.assign(problem, data); return ok(problem); });
  const updateDomain = (token, data) => adminMutation(token, () => { const domain = state.domains.find((item) => item.domainId === data.domainId); if (!domain) return fail("DOMAIN_NOT_FOUND"); const capacity = Number(data.maximumTeams); const usage = state.selections.filter((item) => item.domainId === domain.domainId && item.status === "LOCKED").length; if (!Number.isInteger(capacity) || capacity < usage) return fail("CAPACITY_BELOW_USAGE"); Object.assign(domain, { ...data, maximumTeams: capacity }); return ok(domain); });
  const updateConfig = (token, data) => adminMutation(token, () => {
    const releaseRaw = data.problemReleaseDateTime || (data.problemReleaseDate && data.problemReleaseTime ? `${data.problemReleaseDate}T${data.problemReleaseTime}+05:30` : getReleaseAt());
    const closeRaw = data.problemCloseDateTime || data.PROBLEM_CLOSE_DATETIME || getCloseAt();
    const release = new Date(releaseRaw); const close = new Date(closeRaw);
    if (Number.isNaN(release.getTime()) || Number.isNaN(close.getTime()) || close <= release) return fail("INVALID_CONFIGURATION");
    Object.assign(state.config, data, { problemReleaseDateTime: releaseRaw, problemCloseDateTime: closeRaw, PROBLEM_CLOSE_DATETIME: closeRaw });
    forcedState = null;
    return ok({ ...state.config, problemReleaseDateTime: releaseRaw, problemCloseDateTime: closeRaw });
  });
  const releaseNow = (token) => adminMutation(token, () => { forcedState = "SELECTION_OPEN"; return ok({ selectionState: forcedState }); });
  const closeSelection = (token) => adminMutation(token, () => { forcedState = "SELECTION_CLOSED"; return ok({ selectionState: forcedState }); });
  const getAdminConfiguration = (token) => adminMutation(token, () => ok({ ...state.config, problemReleaseDateTime: getReleaseAt(), problemCloseDateTime: getCloseAt(), selectionState: getSelectionState(), allowSelectionReset: state.config.ALLOW_SELECTION_RESET === "TRUE" }));
  const getAdminStats = (token) => adminMutation(token, () => ok({ registeredTeams: state.teams.length, lockedSelections: state.selections.filter((item) => item.status === "LOCKED").length, totalProblems: state.problems.length, activeProblems: state.problems.filter((item) => item.status === "ACTIVE").length, selectionState: getSelectionState() }));

  const setAllowReset = (token, flag) => adminMutation(token, () => {
    const normalized = String(flag || "").trim().toUpperCase();
    if (normalized !== "TRUE" && normalized !== "FALSE") return fail("INVALID_CONFIGURATION");
    state.config.ALLOW_SELECTION_RESET = normalized;
    return ok({ allowSelectionReset: normalized === "TRUE" });
  });

  const removeTeamSelection = (token, teamId) => adminMutation(token, () => {
    if (state.config.ALLOW_SELECTION_RESET !== "TRUE") return fail("RESET_NOT_ALLOWED");
    const normalizedId = String(teamId || "").trim();
    if (!state.teams.find((t) => t.teamId === normalizedId)) return fail("TEAM_NOT_FOUND");
    const before = state.selections.length;
    state.selections = state.selections.filter((s) => !(s.teamId === normalizedId && s.status === "LOCKED"));
    return ok({ teamId: normalizedId, removed: before - state.selections.length });
  });

  const removeSelectionByPsid = (token, psid) => adminMutation(token, () => {
    if (state.config.ALLOW_SELECTION_RESET !== "TRUE") return fail("RESET_NOT_ALLOWED");
    const normalizedPsid = String(psid || "").trim().toUpperCase();
    const before = state.selections.length;
    state.selections = state.selections.filter((s) => !(String(s.psid || s.PSID).trim().toUpperCase() === normalizedPsid && s.status === "LOCKED"));
    return ok({ psid: normalizedPsid, removed: before - state.selections.length });
  });

  const removeAllSelections = (token) => adminMutation(token, () => {
    if (state.config.ALLOW_SELECTION_RESET !== "TRUE") return fail("RESET_NOT_ALLOWED");
    const before = state.selections.filter((s) => s.status === "LOCKED").length;
    state.selections = state.selections.filter((s) => s.status !== "LOCKED");
    return ok({ removed: before });
  });

  resetTestState();
  return { state: () => state, resetTestState, setTime, getSelectionState, getTeam, getProblems, lockProblem, adminTeams, adminProblems, addTeam, updateTeam, addProblem, updateProblem, updateDomain, updateConfig, releaseNow, closeSelection, getAdminConfiguration, getAdminStats, setAllowReset, removeTeamSelection, removeSelectionByPsid, removeAllSelections };
}