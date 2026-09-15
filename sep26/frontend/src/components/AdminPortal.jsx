import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  apiAdminAddProblem, apiAdminAddTeam, apiAdminCloseSelection,
  apiAdminDisableProblem, apiAdminGetConfiguration, apiAdminGetDomains,
  apiAdminGetFeedback, apiAdminGetFinalSubmissions, apiAdminGetProblems, apiAdminGetSelections, apiAdminGetStats, apiAdminGetTeams,
  apiAdminGetAllData, apiAdminOpenSelection, apiAdminReleaseNow, apiAdminRemoveAllSelections,
  apiAdminRemoveSelectionByPsid, apiAdminRemoveTeamSelection,
  apiAdminSetAllowReset, apiAdminUpdateConfiguration, apiAdminUpdateDomain,
  apiAdminUpdateProblem, apiAdminUpdateTeam, resolveIdToken
} from "../services/appsScriptApi";
import { clearAuthToken, getAuthToken, setAuthToken } from "../services/authSession";
import {
  normalizeConfig, normalizeDomain, normalizeProblem,
  normalizeSelection, normalizeStats, normalizeTeam
} from "../services/apiAdapter";

const mockAdminIdentity = import.meta.env.VITE_USE_MOCK === "true" ? import.meta.env.VITE_MOCK_IDENTITY || "" : "";
const emptyTeam = { teamName: "", leaderName: "", leaderEmail: "", leaderMobile: "", leaderRegisterNumber: "", leaderDepartment: "", domainId: "AGR", members: [{ name: "", registerNumber: "", department: "" }] };

function dateLabel(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "Not configured"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function dateInput(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = {};
  formatter.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

function dateFromInput(valueStr) {
  if (!valueStr) return null;
  const str = String(valueStr).trim();
  if (!str.includes("T")) return null;
  const [datePart, timePart] = str.split("T");
  const timeWithSec = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${datePart}T${timeWithSec}+05:30`;
}

function Panel({ title, children }) {
  return (
    <div className="admin-panel glass-card">
      <div className="admin-panel-title"><h2>{title}</h2></div>
      {children}
    </div>
  );
}

function ModalOverlay({ title, onClose, children }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="admin-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-modal-card glass-card">
        <div className="admin-modal-header">
          <h2 id="admin-modal-title">{title}</h2>
          <button
            type="button"
            className="btn-close btn-close-white"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}

function AdminPortal({ setPage }) {
  const googleButtonRef = useRef(null);
  const [token, setToken] = useState(() => getAuthToken() || mockAdminIdentity);
  const [view, setView] = useState(() => (getAuthToken() || mockAdminIdentity ? "loading" : "login"));
  const [section, setSection] = useState("overview");
  const [data, setData] = useState({ stats: null, teams: [], problems: [], domains: [], config: null, selections: [], feedback: [], finalSubmissions: [] });
  const [error, setError] = useState("");

  const gisInitializedRef = useRef(false);

  const refresh = async (idTokenParam) => {
    const idToken = resolveIdToken(idTokenParam) || token;
    if (!idToken || typeof idToken !== "string") {
      clearAuthToken();
      setToken("");
      setView("login");
      return;
    }

    setView("loading");
    setError("");

    try {
      const allDataRes = await apiAdminGetAllData(idToken);

      if (allDataRes?.success && allDataRes.data) {
        const stats = normalizeStats(allDataRes.data.stats);
        const rawTeams = Array.isArray(allDataRes.data.teams) ? allDataRes.data.teams : [];
        const teams = rawTeams.map(normalizeTeam).filter(Boolean);
        const rawProblems = Array.isArray(allDataRes.data.problems) ? allDataRes.data.problems : [];
        const problems = rawProblems.map(normalizeProblem).filter(Boolean);
        const rawDomains = Array.isArray(allDataRes.data.domains) ? allDataRes.data.domains : [];
        const domains = rawDomains.map(normalizeDomain).filter(Boolean);
        const config = normalizeConfig(allDataRes.data.config);
        const rawSelections = Array.isArray(allDataRes.data.selections) ? allDataRes.data.selections : [];
        const selections = rawSelections.map(normalizeSelection).filter(Boolean);
        const feedback = Array.isArray(allDataRes.data.feedback) ? allDataRes.data.feedback : [];
        const finalSubmissions = Array.isArray(allDataRes.data.finalSubmissions) ? allDataRes.data.finalSubmissions : [];

        setData({ stats, teams, problems, domains, config, selections, feedback, finalSubmissions });
        setView("dashboard");
        return;
      }

      if (["INVALID_TOKEN", "INVALID_AUDIENCE", "AUTH_REQUIRED"].includes(allDataRes?.code)) {
        clearAuthToken();
        setToken("");
        setView("login");
        return;
      }

      console.warn("[ADMIN_REFRESH_FALLBACK] ADMIN_GET_ALL_DATA failed/unsupported. Falling back to parallel requests...", allDataRes);

      const responses = await Promise.all([
        apiAdminGetStats(idToken),
        apiAdminGetTeams(idToken),
        apiAdminGetProblems(idToken),
        apiAdminGetDomains(idToken),
        apiAdminGetConfiguration(idToken),
        apiAdminGetSelections(idToken),
        apiAdminGetFeedback(idToken),
        apiAdminGetFinalSubmissions(idToken)
      ]);

      const authFailed = responses.find((response) => ["INVALID_TOKEN", "INVALID_AUDIENCE", "AUTH_REQUIRED"].includes(response?.code));
      if (authFailed) {
        clearAuthToken();
        setToken("");
        setView("login");
        return;
      }

      const failed = responses.find((response) => !response?.success);
      if (failed) {
        setError(failed.error || "Administrator access was denied.");
        setView("denied");
        return;
      }

      const stats = normalizeStats(responses[0].data);
      const rawTeams = Array.isArray(responses[1].data) ? responses[1].data : (responses[1].data?.teams || []);
      const teams = rawTeams.map(normalizeTeam).filter(Boolean);
      const rawProblems = Array.isArray(responses[2].data) ? responses[2].data : (responses[2].data?.problems || []);
      const problems = rawProblems.map(normalizeProblem).filter(Boolean);
      const rawDomains = Array.isArray(responses[3].data) ? responses[3].data : (responses[3].data?.domains || []);
      const domains = rawDomains.map(normalizeDomain).filter(Boolean);
      const config = normalizeConfig(responses[4].data);
      const rawSelections = Array.isArray(responses[5].data) ? responses[5].data : (responses[5].data?.selections || []);
      const selections = rawSelections.map(normalizeSelection).filter(Boolean);
      const feedback = Array.isArray(responses[6]?.data?.feedback) ? responses[6].data.feedback : (Array.isArray(responses[6]?.feedback) ? responses[6].feedback : []);
      const finalSubmissions = Array.isArray(responses[7]?.data?.finalSubmissions) ? responses[7].data.finalSubmissions : (Array.isArray(responses[7]?.finalSubmissions) ? responses[7].finalSubmissions : []);

      setData({
        stats,
        teams,
        problems,
        domains,
        config,
        selections,
        feedback,
        finalSubmissions
      });
      setView("dashboard");
    } catch (err) {
      console.error("refresh unexpected exception:", err);
      setError("Failed to load admin workspace. Please check your connection.");
      setView("denied");
    }
  };

  const refreshEvent = useEffectEvent(refresh);
  useEffect(() => { if (token) Promise.resolve().then(() => refreshEvent(token)); }, [token]);

  useEffect(() => {
    if (view !== "login" || !googleButtonRef.current) return undefined;
    // Always attempt to render button when login view appears.
    // GIS library init is one-time; button render is needed on every login view mount.
    const tryRender = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!window.google?.accounts?.id || !clientId || !googleButtonRef.current) return false;
      // Initialize the GIS library only once per page load.
      if (!gisInitializedRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              setAuthToken(response.credential);
              setToken(response.credential);
            }
          }
        });
        gisInitializedRef.current = true;
      }
      // Always render the button — re-render is safe and needed after view transitions.
      try {
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 320
        });
      } catch (e) {
        console.warn("[GIS_RENDER] renderButton failed:", e.message);
        return false;
      }
      return true;
    };
    if (tryRender()) return undefined;
    const interval = window.setInterval(() => { if (tryRender()) window.clearInterval(interval); }, 100);
    return () => window.clearInterval(interval);
  }, [view]);

  if (view === "login") {
    return (
      <section className="admin-shell">
        <div className="admin-login glass-card">
          <span className="participant-eyebrow">Restricted workspace</span>
          <h1>Admin control room</h1>
          <p className="participant-muted">Sign in with an active administrator account.</p>
          <div ref={googleButtonRef} className="participant-google-button" />
        </div>
      </section>
    );
  }

  if (view === "loading") {
    return (
      <section className="admin-shell">
        <div className="admin-login glass-card text-center">
          <div className="spinner-border text-info" role="status" aria-label="Loading" />
        </div>
      </section>
    );
  }

  if (view === "denied") {
    return (
      <section className="admin-shell">
        <div className="admin-login glass-card text-center">
          <i className="bi bi-shield-x admin-icon" />
          <h1>Access denied</h1>
          <p className="participant-muted">{error}</p>
          <button className="btn btn-outline-glass" type="button" onClick={() => { setToken(""); setView("login"); }}>
            Back to sign in
          </button>
        </div>
      </section>
    );
  }

  const signOut = () => {
    clearAuthToken();
    setToken("");
    setView("login");
  };

  const tabs = ["overview", "teams", "problems", "domains", "selections", "feedback", "finalSubmissions", "release", "configuration"];

  return (
    <section className="admin-shell container-fluid px-3 px-lg-4 py-4">
      <header className="admin-header">
        <div>
          <span className="participant-eyebrow">INTELLIX / restricted</span>
          <h1>Admin control room</h1>
          <p className="participant-muted mb-0">Google Sheets-backed event operations.</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-glass" type="button" onClick={signOut}>
            <i className="bi bi-box-arrow-right me-2"></i>Sign out
          </button>
          <button className="btn btn-outline-glass" type="button" onClick={() => setPage("home")}>
            Exit
          </button>
        </div>
      </header>
      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map((tab) => (
          <button className={section === tab ? "active" : ""} key={tab} type="button" onClick={() => setSection(tab)}>
            {tab === "finalSubmissions" ? "Final Submissions" : tab}
          </button>
        ))}
      </nav>
      {section === "overview" && <Overview stats={data.stats} feedbackCount={data.feedback?.length || 0} finalSubmissionsCount={data.finalSubmissions?.length || 0} onRefresh={() => refresh()} />}
      {section === "teams" && <Teams teams={data.teams} domains={data.domains} token={token} onRefresh={() => refresh()} />}
      {section === "problems" && <Problems problems={data.problems} domains={data.domains} token={token} onRefresh={() => refresh()} />}
      {section === "domains" && <Domains domains={data.domains} token={token} onRefresh={() => refresh()} />}
      {section === "selections" && <Selections teams={data.teams} selections={data.selections} config={data.config} token={token} onRefresh={() => refresh()} />}
      {section === "feedback" && <FeedbackAdmin feedback={data.feedback} onRefresh={() => refresh()} />}
      {section === "finalSubmissions" && <FinalSubmissionsAdmin finalSubmissions={data.finalSubmissions} onRefresh={() => refresh()} />}
      {section === "release" && <Release config={data.config} token={token} onRefresh={() => refresh()} />}
      {section === "configuration" && (
        <Configuration
          key={`${data.config?.problemReleaseAt}-${data.config?.problemCloseAt}-${data.config?.allowSelectionReset}`}
          config={data.config}
          token={token}
          onRefresh={() => refresh()}
        />
      )}
    </section>
  );
}

function Overview({ stats, feedbackCount = 0, finalSubmissionsCount = 0, onRefresh }) {
  if (!stats) return null;
  const statItems = [
    ["Registered teams", stats.registeredTeams],
    ["Pending teams", stats.pendingTeams],
    ["Locked teams", stats.lockedSelections],
    ["Total problems", stats.totalProblems],
    ["Available problems", stats.availableProblems]
  ];

  const submittedCount = stats.feedbackSubmitted !== undefined ? stats.feedbackSubmitted : feedbackCount;
  statItems.push(["Feedback Submitted", submittedCount]);
  if (stats.activeTeams !== undefined) {
    statItems.push(["Feedback Pending", Math.max(stats.activeTeams - submittedCount, 0)]);
  }

  const finalCount = stats.finalSubmissionsCount !== undefined ? stats.finalSubmissionsCount : finalSubmissionsCount;
  statItems.push(["Final Submissions", finalCount]);
  if (stats.lockedSelections !== undefined) {
    statItems.push(["Final Submissions Pending", Math.max(stats.lockedSelections - finalCount, 0)]);
  }

  return (
    <div className="admin-content">
      <div className="admin-stat-grid">
        {statItems.map(([label, value]) => (
          <div className="admin-stat glass-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Panel title="Domain utilization">
        <button className="btn btn-outline-glass mb-3" type="button" onClick={() => onRefresh()}>
          Refresh
        </button>
        {(stats.domains || []).map((domain) => (
          <div className="admin-meter" key={domain.domainId}>
            <div>
              <strong>{domain.domainName || domain.domainId}</strong>
              <span>{domain.lockedTeams} locked / {domain.maximumTeams} max ({domain.remainingCapacity} remaining)</span>
            </div>
            <div className="admin-meter-track">
              <i style={{ width: `${Math.min(100, domain.lockedTeams / Math.max(1, domain.maximumTeams) * 100)}%` }} />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function FeedbackAdmin({ feedback = [], onRefresh }) {
  const [query, setQuery] = useState("");

  const filtered = (feedback || []).filter((item) =>
    `${item.teamId || item.TeamID} ${item.teamName || item.TeamName} ${item.domain || item.Domain} ${item.feedback || item.Feedback}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <div className="admin-content">
      <Panel title="Team Feedback">
        <div className="admin-toolbar mb-3 d-flex flex-column flex-sm-row justify-content-between gap-2">
          <input
            aria-label="Search feedback"
            placeholder="Search team ID, name, domain, or feedback content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-outline-glass align-self-start align-self-sm-auto" type="button" onClick={() => onRefresh()}>
            <i className="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team ID</th>
                <th>Team Name</th>
                <th>Domain</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No feedback entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((item, index) => (
                  <tr key={`${item.teamId || item.TeamID}-${index}`}>
                    <td><strong>{item.teamId || item.TeamID}</strong></td>
                    <td>{item.teamName || item.TeamName}</td>
                    <td><span className="badge bg-secondary">{item.domain || item.Domain || item.DomainID}</span></td>
                    <td style={{ whiteSpace: "pre-wrap", maxWidth: "450px" }}>{item.feedback || item.Feedback}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FinalSubmissionsAdmin({ finalSubmissions = [], onRefresh }) {
  const [query, setQuery] = useState("");

  const filtered = (finalSubmissions || []).filter((item) =>
    `${item.teamId || item.TeamID} ${item.teamName || item.TeamName} ${item.psId || item.PSID} ${item.teamLeadName || item.TeamLeadName} ${item.teamLeadEmail || item.TeamLeadEmail} ${item.feedback || item.Feedback}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <div className="admin-content">
      <Panel title="Final Submissions">
        <div className="admin-toolbar mb-3 d-flex flex-column flex-sm-row justify-content-between gap-2">
          <input
            aria-label="Search final submissions"
            placeholder="Search team ID, team name, PS ID, leader, or feedback..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-outline-glass align-self-start align-self-sm-auto" type="button" onClick={() => onRefresh()}>
            <i className="bi bi-arrow-clockwise me-1"></i>Refresh
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team ID</th>
                <th>Team Name</th>
                <th>PS ID</th>
                <th>Team Lead Name</th>
                <th>Team Lead Email</th>
                <th>Feedback / Submission Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No final submissions found.
                  </td>
                </tr>
              ) : (
                filtered.map((item, index) => (
                  <tr key={`${item.teamId || item.TeamID}-${index}`}>
                    <td><strong>{item.teamId || item.TeamID}</strong></td>
                    <td>{item.teamName || item.TeamName}</td>
                    <td><span className="badge bg-info text-dark">{item.psId || item.PSID}</span></td>
                    <td>{item.teamLeadName || item.TeamLeadName}</td>
                    <td><span className="participant-email">{item.teamLeadEmail || item.TeamLeadEmail}</span></td>
                    <td style={{ whiteSpace: "pre-wrap", maxWidth: "450px" }}>{item.feedback || item.Feedback}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function TeamFields({ value, onChange, domains }) {
  const set = (key, next) => onChange({ ...value, [key]: next });

  const membersList = value.members || [];
  const activeMembers = membersList.filter((m, i) => i === 0 || m.name || m.registerNumber || m.department);
  const displayMembers = activeMembers.length > 0 ? activeMembers : [{ name: "", registerNumber: "", department: "" }];

  const handleMemberChange = (index, field, val) => {
    const nextMembers = [...membersList];
    while (nextMembers.length <= index) {
      nextMembers.push({ name: "", registerNumber: "", department: "" });
    }
    nextMembers[index] = { ...nextMembers[index], [field]: val };
    onChange({ ...value, members: nextMembers });
  };

  const addMemberSlot = () => {
    if (membersList.length < 4) {
      const nextMembers = [...membersList, { name: "", registerNumber: "", department: "" }];
      onChange({ ...value, members: nextMembers });
    }
  };

  const removeMemberSlot = (index) => {
    const nextMembers = membersList.filter((_, i) => i !== index);
    onChange({ ...value, members: nextMembers });
  };

  return (
    <div className="admin-form-container">
      {/* SECTION 1: Team Information */}
      <div className="admin-form-section">
        <div className="admin-form-section-header">
          <h3 className="admin-form-section-title">
            <i className="bi bi-people-fill"></i> Team Information
          </h3>
        </div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">
              Team ID <span className="admin-form-label-badge">(Read-only)</span>
            </label>
            <input
              type="text"
              className="admin-input-readonly"
              value={value.teamId || "Auto-assigned"}
              readOnly
              tabIndex={-1}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Team Name *</label>
            <input
              type="text"
              value={value.teamName || ""}
              onChange={(e) => set("teamName", e.target.value)}
              placeholder="Enter team name"
              required
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Domain *</label>
            <select
              value={value.domainId || "AGR"}
              onChange={(e) => set("domainId", e.target.value)}
            >
              {domains.map((d) => (
                <option key={d.domainId} value={d.domainId}>
                  {d.domainId} - {d.domainName} {d.status !== "ACTIVE" ? "(Disabled)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Status *</label>
            <select
              value={value.status || "ACTIVE"}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Leader Information */}
      <div className="admin-form-section">
        <div className="admin-form-section-header">
          <h3 className="admin-form-section-title">
            <i className="bi bi-person-badge-fill"></i> Leader Information
          </h3>
        </div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Leader Name *</label>
            <input
              type="text"
              value={value.leaderName || ""}
              onChange={(e) => set("leaderName", e.target.value)}
              placeholder="Leader full name"
              required
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">
              Leader Email {value.teamId ? <span className="admin-form-label-badge">(Read-only)</span> : "*"}
            </label>
            <input
              type="email"
              className={value.teamId ? "admin-input-readonly" : ""}
              value={value.leaderEmail || ""}
              onChange={(e) => set("leaderEmail", e.target.value)}
              placeholder="leader@example.com"
              readOnly={Boolean(value.teamId)}
              required
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Register Number</label>
            <input
              type="text"
              value={value.leaderRegisterNumber || ""}
              onChange={(e) => set("leaderRegisterNumber", e.target.value)}
              placeholder="Register / Roll number"
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Department</label>
            <input
              type="text"
              value={value.leaderDepartment || ""}
              onChange={(e) => set("leaderDepartment", e.target.value)}
              placeholder="e.g. CSE / IT"
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Leader Mobile</label>
            <input
              type="tel"
              value={value.leaderMobile || ""}
              onChange={(e) => set("leaderMobile", e.target.value)}
              placeholder="Mobile number"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: Member Information */}
      <div className="admin-form-section">
        <div className="admin-form-section-header">
          <h3 className="admin-form-section-title">
            <i className="bi bi-people"></i> Member Information
          </h3>
          {displayMembers.length < 4 && (
            <button
              type="button"
              className="btn btn-outline-glass btn-sm"
              onClick={addMemberSlot}
              style={{ fontSize: "0.78rem", minHeight: "32px" }}
            >
              <i className="bi bi-plus-lg me-1"></i> Add Member
            </button>
          )}
        </div>
        <div className="d-flex flex-column gap-3">
          {displayMembers.map((member, index) => (
            <div className="admin-member-row" key={index}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="admin-member-label">Member {index + 1}</span>
                {index > 0 && (
                  <button
                    type="button"
                    className="btn btn-link text-danger p-0 border-0"
                    style={{ fontSize: "0.8rem", textDecoration: "none" }}
                    onClick={() => removeMemberSlot(index)}
                  >
                    <i className="bi bi-trash me-1"></i> Remove
                  </button>
                )}
              </div>
              <div className="admin-member-fields">
                <div className="admin-form-group">
                  <label className="admin-form-label">Name</label>
                  <input
                    aria-label={`Member ${index + 1} name`}
                    value={member.name || ""}
                    onChange={(e) => handleMemberChange(index, "name", e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Register Number</label>
                  <input
                    aria-label={`Member ${index + 1} register number`}
                    value={member.registerNumber || ""}
                    onChange={(e) => handleMemberChange(index, "registerNumber", e.target.value)}
                    placeholder="Register number"
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Department</label>
                  <input
                    aria-label={`Member ${index + 1} department`}
                    value={member.department || ""}
                    onChange={(e) => handleMemberChange(index, "department", e.target.value)}
                    placeholder="Department"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Teams({ teams, domains, token, onRefresh }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = teams.filter((team) =>
    `${team.teamId} ${team.teamName} ${team.leaderName} ${team.leaderEmail} ${team.domainId}`.toLowerCase().includes(query.toLowerCase()) &&
    (!status || team.status === status)
  );

  const openAdd = () => {
    setModalError("");
    setForm({
      ...emptyTeam,
      members: [
        { name: "", registerNumber: "", department: "" },
        { name: "", registerNumber: "", department: "" },
        { name: "", registerNumber: "", department: "" },
        { name: "", registerNumber: "", department: "" }
      ]
    });
  };

  const openEdit = (team) => {
    setModalError("");
    const members = [...(team.members || [])];
    while (members.length < 4) {
      members.push({ name: "", registerNumber: "", department: "" });
    }
    setForm({ ...team, members });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setModalError("");
    const response = form.teamId
      ? await apiAdminUpdateTeam(token, form)
      : await apiAdminAddTeam(token, form);
    setSaving(false);
    if (response.success) {
      setMessage("Team saved successfully.");
      setForm(null);
      await onRefresh();
    } else {
      setModalError(response.error || "Failed to save team.");
    }
  };

  return (
    <div className="admin-content">
      <Panel title="Teams">
        <div className="admin-toolbar">
          <input aria-label="Search teams" placeholder="Search team ID, name, leader, email, domain" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Filter team status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
          <button className="btn btn-brand" type="button" onClick={openAdd}>
            Add team
          </button>
        </div>
        {message && <p className="participant-muted" role="status">{message}</p>}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team ID</th>
                <th>Team Name</th>
                <th>Leader</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Selection</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>No teams found matching search criteria.</td></tr>
              ) : (
                filtered.map((team) => (
                  <tr key={team.teamId}>
                    <td><strong>{team.teamId}</strong></td>
                    <td>{team.teamName}</td>
                    <td>{team.leaderName}<small>{team.leaderEmail}</small></td>
                    <td>{team.domainId}</td>
                    <td>{team.status}</td>
                    <td>{team.selection?.psId ? <strong>{team.selection.psId}</strong> : <span className="text-muted">Pending</span>}</td>
                    <td>
                      <button className="btn btn-outline-glass" type="button" onClick={() => openEdit(team)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      {form && (
        <ModalOverlay
          title={
            <div className="d-flex align-items-center gap-2">
              <span>{form.teamId ? `Edit Team: ${form.teamId}` : "Add New Team"}</span>
              {form.teamId && (
                <span className={`badge ${form.status === "ACTIVE" ? "bg-success" : "bg-secondary"}`} style={{ fontSize: "0.75rem" }}>
                  {form.status || "ACTIVE"}
                </span>
              )}
            </div>
          }
          onClose={() => { if (!saving) { setForm(null); setModalError(""); } }}
        >
          <form onSubmit={save}>
            <TeamFields value={form} onChange={setForm} domains={domains} />
            {modalError && (
              <div className="participant-alert mt-3" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                {modalError}
              </div>
            )}
            <div className="admin-modal-actions">
              <button
                className="btn btn-outline-glass"
                type="button"
                disabled={saving}
                onClick={() => { setForm(null); setModalError(""); }}
              >
                Cancel
              </button>
              <button className="btn btn-brand" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Saving...
                  </>
                ) : (
                  "Save Team"
                )}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}

function Problems({ problems, domains, token, onRefresh }) {
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = problems.filter((problem) =>
    `${problem.psId} ${problem.title} ${problem.description} ${problem.domainId}`.toLowerCase().includes(query.toLowerCase()) &&
    (!domainFilter || problem.domainId === domainFilter) &&
    (!statusFilter || problem.status === statusFilter)
  );

  const openAdd = () => {
    setModalError("");
    setForm({ domainId: "AGR", title: "", description: "", whatToBuild: "" });
  };

  const openEdit = (problem) => {
    setModalError("");
    setForm({ ...problem });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setModalError("");
    const response = form.psId
      ? await apiAdminUpdateProblem(token, form)
      : await apiAdminAddProblem(token, form);
    setSaving(false);
    if (response.success) {
      setMessage("Problem saved successfully.");
      setForm(null);
      await onRefresh();
    } else {
      setModalError(response.error || "Failed to save problem.");
    }
  };

  const disable = async (psId) => {
    if (!window.confirm(`Disable problem ${psId}?`)) return;
    const response = await apiAdminDisableProblem(token, { psId });
    setMessage(response.success ? `Problem ${psId} disabled.` : response.error);
    if (response.success) onRefresh();
  };

  return (
    <div className="admin-content">
      <Panel title="Problems">
        <div className="admin-toolbar">
          <input aria-label="Search problems" placeholder="Search PSID, title, description" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Filter problem domain" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">All domains</option>
            {domains.map((item) => <option key={item.domainId} value={item.domainId}>{item.domainId}</option>)}
          </select>
          <select aria-label="Filter problem status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
          <button className="btn btn-brand" type="button" onClick={openAdd}>
            Add problem
          </button>
        </div>
        {message && <p className="participant-muted" role="status">{message}</p>}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>PSID</th>
                <th>Domain</th>
                <th>Title</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No problems found.</td></tr>
              ) : (
                filtered.map((problem) => (
                  <tr key={problem.psId}>
                    <td><strong>{problem.psId}</strong></td>
                    <td>{problem.domainId}</td>
                    <td>{problem.title}</td>
                    <td>{problem.status}</td>
                    <td>
                      <button className="btn btn-outline-glass me-1" type="button" onClick={() => openEdit(problem)}>
                        Edit
                      </button>
                      {problem.status === "ACTIVE" && (
                        <button className="btn btn-outline-glass" type="button" onClick={() => disable(problem.psId)}>
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
      {form && (
        <ModalOverlay
          title={
            <div className="d-flex align-items-center gap-2">
              <span>{form.psId ? `Edit Problem: ${form.psId}` : "Add New Problem"}</span>
              {form.psId && (
                <span className={`badge ${form.status === "ACTIVE" ? "bg-success" : "bg-secondary"}`} style={{ fontSize: "0.75rem" }}>
                  {form.status || "ACTIVE"}
                </span>
              )}
            </div>
          }
          onClose={() => { if (!saving) { setForm(null); setModalError(""); } }}
        >
          <form onSubmit={save}>
            <div className="admin-form-section">
              <div className="admin-form-section-header">
                <h3 className="admin-form-section-title">
                  <i className="bi bi-file-earmark-text-fill"></i> Problem Information
                </h3>
              </div>
              <div className="admin-form-grid">
                {form.psId && (
                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      PSID <span className="admin-form-label-badge">(Read-only)</span>
                    </label>
                    <input
                      type="text"
                      className="admin-input-readonly"
                      value={form.psId}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                )}
                <div className="admin-form-group">
                  <label className="admin-form-label">Domain *</label>
                  <select
                    value={form.domainId || "AGR"}
                    onChange={(e) => setForm({ ...form, domainId: e.target.value })}
                  >
                    {domains.map((item) => (
                      <option key={item.domainId} value={item.domainId}>
                        {item.domainId} - {item.domainName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Status *</label>
                  <select
                    value={form.status || "ACTIVE"}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </div>
                <div className="admin-form-group admin-field-full">
                  <label className="admin-form-label">Title *</label>
                  <input
                    type="text"
                    value={form.title || ""}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Problem statement title"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="admin-form-section">
              <div className="admin-form-section-header">
                <h3 className="admin-form-section-title">
                  <i className="bi bi-card-text"></i> Detailed Specifications
                </h3>
              </div>
              <div className="d-flex flex-column gap-3">
                <div className="admin-form-group">
                  <label className="admin-form-label">Description *</label>
                  <textarea
                    className="admin-textarea-large"
                    rows={4}
                    value={form.description || ""}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Full problem description and context..."
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">What To Build *</label>
                  <textarea
                    className="admin-textarea-large"
                    rows={4}
                    value={form.whatToBuild || ""}
                    onChange={(e) => setForm({ ...form, whatToBuild: e.target.value })}
                    placeholder="Key deliverables and features expected..."
                    required
                  />
                </div>
              </div>
            </div>

            {modalError && (
              <div className="participant-alert mt-3" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                {modalError}
              </div>
            )}
            <div className="admin-modal-actions">
              <button
                className="btn btn-outline-glass"
                type="button"
                disabled={saving}
                onClick={() => { setForm(null); setModalError(""); }}
              >
                Cancel
              </button>
              <button className="btn btn-brand" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Saving...
                  </>
                ) : (
                  "Save Problem"
                )}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}

function Domains({ domains, token, onRefresh }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (domain) => {
    setModalError("");
    setForm({ domainId: domain.domainId, domainName: domain.domainName, maximumTeams: domain.maximumTeams, status: domain.status });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setModalError("");
    const response = await apiAdminUpdateDomain(token, form);
    setSaving(false);
    if (response.success) {
      setMessage("Domain saved successfully.");
      setForm(null);
      await onRefresh();
    } else {
      setModalError(response.error || "Failed to save domain.");
    }
  };

  return (
    <div className="admin-content">
      <Panel title="Domains &amp; capacity">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Domain ID</th>
                <th>Domain Name</th>
                <th>Maximum Teams</th>
                <th>Registered Teams</th>
                <th>Locked Teams</th>
                <th>Remaining Capacity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.domainId}>
                  <td><strong>{domain.domainId}</strong></td>
                  <td>{domain.domainName}</td>
                  <td>{domain.maximumTeams}</td>
                  <td>{domain.registeredTeams}</td>
                  <td>{domain.lockedTeams}</td>
                  <td>{domain.remainingCapacity}</td>
                  <td><span className={`badge ${domain.status === "ACTIVE" ? "bg-success" : "bg-secondary"}`}>{domain.status}</span></td>
                  <td>
                    <button className="btn btn-outline-glass" type="button" onClick={() => openEdit(domain)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && <p className="participant-muted mt-3" role="status" style={{ color: message.includes("success") ? "#4ade80" : "#f87171" }}>{message}</p>}
      </Panel>
      {form && (
        <ModalOverlay
          title={
            <div className="d-flex align-items-center gap-2">
              <span>Edit Domain: {form.domainId}</span>
              <span className={`badge ${form.status === "ACTIVE" ? "bg-success" : "bg-secondary"}`} style={{ fontSize: "0.75rem" }}>
                {form.status || "ACTIVE"}
              </span>
            </div>
          }
          onClose={() => { if (!saving) { setForm(null); setModalError(""); } }}
        >
          <form onSubmit={save}>
            <div className="admin-form-section">
              <div className="admin-form-section-header">
                <h3 className="admin-form-section-title">
                  <i className="bi bi-grid-fill"></i> Domain Information
                </h3>
              </div>
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label className="admin-form-label">
                    Domain ID <span className="admin-form-label-badge">(Read-only)</span>
                  </label>
                  <input
                    type="text"
                    className="admin-input-readonly"
                    value={form.domainId}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Status *</label>
                  <select
                    value={form.status || "ACTIVE"}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>
                </div>
                <div className="admin-form-group admin-field-full">
                  <label className="admin-form-label">Domain Name *</label>
                  <input
                    type="text"
                    value={form.domainName || ""}
                    onChange={(e) => setForm({ ...form, domainName: e.target.value })}
                    placeholder="Domain display name"
                    required
                    autoFocus
                  />
                </div>
                <div className="admin-form-group admin-field-full">
                  <label className="admin-form-label">Maximum Teams *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.maximumTeams !== undefined ? form.maximumTeams : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm({ ...form, maximumTeams: val === "" ? 0 : Math.max(0, parseInt(val, 10) || 0) });
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {modalError && (
              <div className="participant-alert mt-3" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                {modalError}
              </div>
            )}
            <div className="admin-modal-actions">
              <button
                className="btn btn-outline-glass"
                type="button"
                disabled={saving}
                onClick={() => { setForm(null); setModalError(""); }}
              >
                Cancel
              </button>
              <button className="btn btn-brand" type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Saving...
                  </>
                ) : (
                  "Save Domain"
                )}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </div>
  );
}

function Selections({ teams, selections = [], config, token, onRefresh }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmAllText, setConfirmAllText] = useState("");

  const resetAllowed = Boolean(config?.allowSelectionReset);

  const displaySelections = selections.length > 0
    ? selections
    : teams.filter((t) => t.selection?.psId).map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        domainId: t.domainId,
        psId: t.selection.psId,
        problemTitle: t.selection.problemTitle || "",
        status: t.selection.status || "LOCKED"
      }));

  const removeOneByTeamId = async (teamId) => {
    if (!resetAllowed) { setMessage("ALLOW_SELECTION_RESET is FALSE. Enable it in Safety Controls first."); return; }
    if (!window.confirm(`Remove selection for team ${teamId}?`)) return;
    setBusy(true);
    setMessage("");
    const response = await apiAdminRemoveTeamSelection(token, { teamId });
    setMessage(response.success ? `Selection removed for team ${teamId}.` : (response.error || "Remove selection failed."));
    if (response.success) onRefresh();
    setBusy(false);
  };

  const removeOneByPsid = async (psId) => {
    if (!resetAllowed) { setMessage("ALLOW_SELECTION_RESET is FALSE. Enable it in Safety Controls first."); return; }
    if (!window.confirm(`Remove selection record for problem ${psId}?`)) return;
    setBusy(true);
    setMessage("");
    const response = await apiAdminRemoveSelectionByPsid(token, { psId });
    setMessage(response.success ? `Selection record removed for problem ${psId}.` : (response.error || "Remove selection failed."));
    if (response.success) onRefresh();
    setBusy(false);
  };

  const removeAll = async () => {
    if (!resetAllowed) { setMessage("ALLOW_SELECTION_RESET is FALSE. Enable it in Safety Controls first."); setConfirmAll(false); return; }
    if (confirmAllText !== "REMOVE ALL") { setMessage("Type REMOVE ALL exactly to confirm."); return; }
    setBusy(true);
    setMessage("");
    setConfirmAll(false);
    setConfirmAllText("");
    const response = await apiAdminRemoveAllSelections(token);
    setMessage(response.success ? `All selections removed (${response.data?.removed ?? 0} rows cleared).` : (response.error || "Remove all selections failed."));
    if (response.success) onRefresh();
    setBusy(false);
  };

  return (
    <div className="admin-content">
      <Panel title="Selection management">
        <div className="mb-3 d-flex align-items-center gap-3 flex-wrap">
          <span className={`badge ${resetAllowed ? "bg-warning text-dark" : "bg-secondary"}`}>
            ALLOW_SELECTION_RESET: {resetAllowed ? "TRUE" : "FALSE"}
          </span>
          {!resetAllowed && (
            <span className="participant-muted" style={{ fontSize: "0.85rem" }}>
              Enable <strong>ALLOW_SELECTION_RESET</strong> in Configuration / Safety Controls to unlock reset operations.
            </span>
          )}
          {resetAllowed && displaySelections.length > 0 && (
            <button
              className="btn btn-outline-glass ms-auto"
              type="button"
              disabled={busy}
              onClick={() => { setConfirmAll(true); setConfirmAllText(""); setMessage(""); }}
            >
              Remove all selections
            </button>
          )}
        </div>

        {confirmAll && (
          <div className="admin-panel glass-card mb-3" style={{ border: "1px solid #f59e0b" }}>
            <p className="mb-2" style={{ color: "#f59e0b" }}>
              <strong>⚠ This will permanently remove all {displaySelections.length} locked selection(s).</strong>
            </p>
            <p className="participant-muted mb-2">Teams will return to pending. Problems become available again. Registrations and Team IDs are NOT affected.</p>
            <p className="participant-muted mb-2">Type <code>REMOVE ALL</code> to confirm:</p>
            <input
              aria-label="Confirm remove all"
              value={confirmAllText}
              onChange={(e) => setConfirmAllText(e.target.value)}
              style={{ marginBottom: "0.75rem", width: "100%", maxWidth: "280px" }}
            />
            <div className="d-flex gap-2">
              <button className="btn btn-brand" type="button" disabled={busy || confirmAllText !== "REMOVE ALL"} onClick={removeAll}>
                {busy ? "Removing..." : "Confirm remove all"}
              </button>
              <button className="btn btn-outline-glass" type="button" onClick={() => { setConfirmAll(false); setConfirmAllText(""); }}>Cancel</button>
            </div>
          </div>
        )}

        {message && <p className="participant-muted mb-3" role="status" style={{ color: message.toLowerCase().includes("error") || message.toLowerCase().includes("false") || message.toLowerCase().includes("failed") ? "#f87171" : "#4ade80" }}>{message}</p>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Team ID</th>
                <th>Team Name</th>
                <th>Domain</th>
                <th>Problem</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displaySelections.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No locked selections found.</td></tr>
              ) : (
                displaySelections.map((sel, idx) => {
                  const isCorruptRow = !sel.teamId || sel.teamId === "undefined" || sel.teamId === "null";
                  return (
                    <tr key={sel.teamId || `sel-${idx}`}>
                      <td>
                        {isCorruptRow ? (
                          <span className="badge bg-danger text-light">undefined (Corrupt)</span>
                        ) : (
                          <strong>{sel.teamId}</strong>
                        )}
                      </td>
                      <td>{sel.teamName || <span className="text-muted">[Missing Team]</span>}</td>
                      <td>{sel.domainId}</td>
                      <td><strong>{sel.psId}</strong>{sel.problemTitle ? <small>{sel.problemTitle}</small> : null}</td>
                      <td>{sel.status}</td>
                      <td>
                        {isCorruptRow ? (
                          <button
                            className="btn btn-outline-danger btn-sm"
                            type="button"
                            disabled={busy || !resetAllowed}
                            title={!resetAllowed ? "ALLOW_SELECTION_RESET is FALSE" : "Remove corrupt selection by PSID"}
                            onClick={() => removeOneByPsid(sel.psId)}
                          >
                            Remove by PSID ({sel.psId})
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline-glass"
                            type="button"
                            disabled={busy || !resetAllowed}
                            title={!resetAllowed ? "ALLOW_SELECTION_RESET is FALSE" : "Remove selection"}
                            onClick={() => removeOneByTeamId(sel.teamId)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Release({ config, token, onRefresh }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (request, prompt) => {
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    const res = await request(token);
    setBusy(false);
    if (res?.success) {
      setMessage("Release state updated successfully.");
      onRefresh();
    } else {
      setMessage(res?.error || "Action failed.");
    }
  };

  return (
    <Panel title="Release control">
      <div className="admin-release-grid">
        <div><span>Problem release (IST)</span><strong>{dateLabel(config.problemReleaseAt)}</strong></div>
        <div><span>Problem close (IST)</span><strong>{dateLabel(config.problemCloseAt)}</strong></div>
      </div>
      <p className="admin-state mt-3">Current State: <strong>{config.selectionState}</strong></p>
      {message && <p className="participant-muted" role="status" style={{ color: message.toLowerCase().includes("failed") ? "#f87171" : "#4ade80" }}>{message}</p>}
      <div className="d-flex gap-2 flex-wrap mt-3">
        <button className="btn btn-brand" type="button" disabled={busy} onClick={() => run(apiAdminReleaseNow, "Release problem selection now?")}>
          Release now
        </button>
        <button className="btn btn-outline-glass" type="button" disabled={busy} onClick={() => run(apiAdminOpenSelection, "Open problem selection?")}>
          Open Selection
        </button>
        <button className="btn btn-outline-glass" type="button" disabled={busy} onClick={() => run(apiAdminCloseSelection, "Close problem selection?")}>
          Close selection
        </button>
      </div>
    </Panel>
  );
}

function Configuration({ config, token, onRefresh }) {
  const [release, setRelease] = useState(() => dateInput(config.problemReleaseAt));
  const [close, setClose] = useState(() => dateInput(config.problemCloseAt));
  const [allowReset, setAllowReset] = useState(Boolean(config.allowSelectionReset));
  const [regEnabled, setRegEnabled] = useState(() => String(config.registrationEnabled || "").toUpperCase() !== "FALSE");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const saveTiming = async (event) => {
    event.preventDefault();
    if (!release || !close) {
      setMessage("Both release and close datetimes are required.");
      return;
    }
    const releaseIso = dateFromInput(release);
    const closeIso = dateFromInput(close);
    const releaseDateObj = new Date(releaseIso);
    const closeDateObj = new Date(closeIso);
    if (closeDateObj.getTime() <= releaseDateObj.getTime()) {
      setMessage("Problem close time must be strictly after release time.");
      return;
    }

    setBusy(true);
    const result = await apiAdminUpdateConfiguration(token, {
      problemReleaseAt: releaseIso,
      problemCloseAt: closeIso
    });
    setBusy(false);
    setMessage(result.success ? "Configuration saved." : (result.error || "Failed to save configuration."));
    if (result.success) onRefresh();
  };

  const toggleReg = async () => {
    const newVal = !regEnabled;
    const confirmMsg = newVal
      ? "Enable registration? Teams will be able to register."
      : "Disable registration? This will stop new team registrations.";
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    const result = await apiAdminUpdateConfiguration(token, { registrationEnabled: newVal ? "TRUE" : "FALSE" });
    setBusy(false);
    if (result.success) {
      setRegEnabled(newVal);
      setMessage(`Registration ${newVal ? "ENABLED" : "DISABLED"}.`);
      onRefresh();
    } else {
      setMessage(result.error || "Failed to update registration status.");
    }
  };

  const toggleReset = async () => {
    const newFlag = !allowReset;
    const confirmMsg = newFlag
      ? "Enable ALLOW_SELECTION_RESET? This permits admins to remove selections."
      : "Disable ALLOW_SELECTION_RESET? This prevents all selection resets.";
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    const result = await apiAdminSetAllowReset(token, { allowSelectionReset: newFlag ? "TRUE" : "FALSE" });
    setBusy(false);
    if (result.success) {
      setAllowReset(newFlag);
      setMessage(`ALLOW_SELECTION_RESET set to ${newFlag ? "TRUE" : "FALSE"}.`);
      onRefresh();
    } else {
      setMessage(result.error);
    }
  };

  const msgColor = message.toLowerCase().includes("error") || message.toLowerCase().includes("must") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("disable") ? "#f87171" : "#4ade80";

  return (
    <div className="admin-content">
      <form className="admin-panel glass-card" onSubmit={saveTiming}>
        <div className="admin-panel-title">
          <h2>Timing configuration (Asia/Kolkata - IST)</h2>
          <span>State: <strong>{config.selectionState}</strong></span>
        </div>
        <div className="admin-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label>Problem release (IST)
            <input type="datetime-local" value={release} onChange={(e) => setRelease(e.target.value)} required />
          </label>
          <label>Problem close (IST)
            <input type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} required />
          </label>
        </div>
        {message && <p className="participant-muted" role="status" style={{ color: msgColor }}>{message}</p>}
        <button className="btn btn-brand mt-2" type="submit" disabled={busy}>Save timing</button>
      </form>

      <Panel title="Registration control">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div>
            <p className="mb-1"><strong>REGISTRATION_ENABLED</strong></p>
            <p className="participant-muted mb-2" style={{ fontSize: "0.85rem" }}>
              Controls whether new teams can register. Toggle to open or close registration.
            </p>
            <span className={`badge me-3 ${regEnabled ? "bg-success" : "bg-danger"}`}>
              Current: {regEnabled ? "TRUE" : "FALSE"}
            </span>
            <button
              className={`btn ${regEnabled ? "btn-outline-glass" : "btn-brand"}`}
              type="button"
              disabled={busy}
              onClick={toggleReg}
            >
              {regEnabled ? "Disable registration" : "Enable registration"}
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Safety controls">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div>
            <p className="mb-1"><strong>ALLOW_SELECTION_RESET</strong></p>
            <p className="participant-muted mb-2" style={{ fontSize: "0.85rem" }}>
              When TRUE, admins can remove individual team selections, corrupt rows by PSID, or clear all selections.<br />
              Default (safe) state is <strong>FALSE</strong>. Set to TRUE only during authorized reset operations.
            </p>
            <span className={`badge me-3 ${allowReset ? "bg-warning text-dark" : "bg-secondary"}`}>
              Current: {allowReset ? "TRUE" : "FALSE"}
            </span>
            <button
              className={`btn ${allowReset ? "btn-outline-glass" : "btn-brand"}`}
              type="button"
              disabled={busy}
              onClick={toggleReset}
            >
              {allowReset ? "Disable (set FALSE)" : "Enable (set TRUE)"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default AdminPortal;