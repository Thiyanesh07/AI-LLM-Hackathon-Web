import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  apiAdminAddProblem, apiAdminAddTeam, apiAdminCloseSelection,
  apiAdminDisableProblem, apiAdminGetConfiguration, apiAdminGetDomains,
  apiAdminGetProblems, apiAdminGetSelections, apiAdminGetStats, apiAdminGetTeams,
  apiAdminGetAllData, apiAdminOpenSelection, apiAdminReleaseNow, apiAdminRemoveAllSelections,
  apiAdminRemoveSelectionByPsid, apiAdminRemoveTeamSelection,
  apiAdminSetAllowReset, apiAdminUpdateConfiguration, apiAdminUpdateDomain,
  apiAdminUpdateProblem, apiAdminUpdateTeam
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

function AdminPortal({ setPage }) {
  const googleButtonRef = useRef(null);
  const [token, setToken] = useState(() => getAuthToken() || mockAdminIdentity);
  const [view, setView] = useState(() => (getAuthToken() || mockAdminIdentity ? "loading" : "login"));
  const [section, setSection] = useState("overview");
  const [data, setData] = useState({ stats: null, teams: [], problems: [], domains: [], config: null, selections: [] });
  const [error, setError] = useState("");

  const gisInitializedRef = useRef(false);

  const refresh = async (idToken = token) => {
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

        setData({ stats, teams, problems, domains, config, selections });
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
        apiAdminGetSelections(idToken)
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

      setData({
        stats,
        teams,
        problems,
        domains,
        config,
        selections
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
    const initialize = () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!window.google || !clientId || !googleButtonRef.current) return false;
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
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 320
      });
      return true;
    };
    if (initialize()) return undefined;
    const interval = window.setInterval(() => { if (initialize()) window.clearInterval(interval); }, 100);
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

  const tabs = ["overview", "teams", "problems", "domains", "selections", "release", "configuration"];

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
            {tab}
          </button>
        ))}
      </nav>
      {section === "overview" && <Overview stats={data.stats} onRefresh={refresh} />}
      {section === "teams" && <Teams teams={data.teams} domains={data.domains} token={token} onRefresh={refresh} />}
      {section === "problems" && <Problems problems={data.problems} domains={data.domains} token={token} onRefresh={refresh} />}
      {section === "domains" && <Domains domains={data.domains} token={token} onRefresh={refresh} />}
      {section === "selections" && <Selections teams={data.teams} selections={data.selections} config={data.config} token={token} onRefresh={refresh} />}
      {section === "release" && <Release config={data.config} token={token} onRefresh={refresh} />}
      {section === "configuration" && <Configuration config={data.config} token={token} onRefresh={refresh} />}
    </section>
  );
}

function Overview({ stats, onRefresh }) {
  if (!stats) return null;
  return (
    <div className="admin-content">
      <div className="admin-stat-grid">
        {[
          ["Registered teams", stats.registeredTeams],
          ["Pending teams", stats.pendingTeams],
          ["Locked teams", stats.lockedSelections],
          ["Total problems", stats.totalProblems],
          ["Available problems", stats.availableProblems]
        ].map(([label, value]) => (
          <div className="admin-stat glass-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Panel title="Domain utilization">
        <button className="btn btn-outline-glass mb-3" type="button" onClick={onRefresh}>
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

function TeamFields({ value, onChange, domains }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <div className="admin-form-grid">
      <label>Team name
        <input value={value.teamName || ""} onChange={(e) => set("teamName", e.target.value)} required />
      </label>
      <label>Domain
        <select value={value.domainId || "AGR"} onChange={(e) => set("domainId", e.target.value)}>
          {domains.filter((d) => d.status === "ACTIVE").map((d) => (
            <option key={d.domainId} value={d.domainId}>{d.domainId} - {d.domainName}</option>
          ))}
        </select>
      </label>
      <label>Leader name
        <input value={value.leaderName || ""} onChange={(e) => set("leaderName", e.target.value)} required />
      </label>
      <label>Leader email
        <input type="email" value={value.leaderEmail || ""} onChange={(e) => set("leaderEmail", e.target.value)} required />
      </label>
      <label>Leader mobile
        <input value={value.leaderMobile || ""} onChange={(e) => set("leaderMobile", e.target.value)} required />
      </label>
      <label>Leader register number
        <input value={value.leaderRegisterNumber || ""} onChange={(e) => set("leaderRegisterNumber", e.target.value)} required />
      </label>
      <label>Leader department
        <input value={value.leaderDepartment || ""} onChange={(e) => set("leaderDepartment", e.target.value)} required />
      </label>
      {(value.members || []).map((member, index) => (
        <div className="admin-member-fields" key={index}>
          <strong>Member {index + 1}</strong>
          <input aria-label={`Member ${index + 1} name`} placeholder="Name" value={member.name || ""} onChange={(e) => { const members = [...value.members]; members[index] = { ...member, name: e.target.value }; onChange({ ...value, members }); }} />
          <input aria-label={`Member ${index + 1} register number`} placeholder="Register number" value={member.registerNumber || ""} onChange={(e) => { const members = [...value.members]; members[index] = { ...member, registerNumber: e.target.value }; onChange({ ...value, members }); }} />
          <input aria-label={`Member ${index + 1} department`} placeholder="Department" value={member.department || ""} onChange={(e) => { const members = [...value.members]; members[index] = { ...member, department: e.target.value }; onChange({ ...value, members }); }} />
        </div>
      ))}
    </div>
  );
}

function Teams({ teams, domains, token, onRefresh }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  const filtered = teams.filter((team) =>
    `${team.teamId} ${team.teamName} ${team.leaderName} ${team.leaderEmail} ${team.domainId}`.toLowerCase().includes(query.toLowerCase()) &&
    (!status || team.status === status)
  );

  const save = async (event) => {
    event.preventDefault();
    const response = form.teamId
      ? await apiAdminUpdateTeam(token, form)
      : await apiAdminAddTeam(token, form);
    setMessage(response.success ? "Team saved successfully." : (response.error || "Failed to save team."));
    if (response.success) { setForm(null); onRefresh(); }
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
          <button className="btn btn-brand" type="button" onClick={() => setForm({ ...emptyTeam, members: [{ name: "", registerNumber: "", department: "" }] })}>
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
                      <button className="btn btn-outline-glass" type="button" onClick={() => setForm({ ...team })}>
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
        <form className="admin-panel glass-card" onSubmit={save}>
          <div className="admin-panel-title"><h2>{form.teamId ? `Edit ${form.teamId}` : "Add team"}</h2></div>
          <TeamFields value={form} onChange={setForm} domains={domains} />
          <button className="btn btn-brand" type="submit">Save team</button>
          <button className="btn btn-outline-glass ms-2" type="button" onClick={() => setForm(null)}>Cancel</button>
        </form>
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

  const filtered = problems.filter((problem) =>
    `${problem.psId} ${problem.title} ${problem.description} ${problem.domainId}`.toLowerCase().includes(query.toLowerCase()) &&
    (!domainFilter || problem.domainId === domainFilter) &&
    (!statusFilter || problem.status === statusFilter)
  );

  const save = async (event) => {
    event.preventDefault();
    const response = form.psId
      ? await apiAdminUpdateProblem(token, form)
      : await apiAdminAddProblem(token, form);
    setMessage(response.success ? "Problem saved successfully." : (response.error || "Failed to save problem."));
    if (response.success) { setForm(null); onRefresh(); }
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
          <button className="btn btn-brand" type="button" onClick={() => setForm({ domainId: "AGR", title: "", description: "", whatToBuild: "" })}>
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
                      <button className="btn btn-outline-glass me-1" type="button" onClick={() => setForm({ ...problem })}>
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
        <form className="admin-panel glass-card" onSubmit={save}>
          <div className="admin-panel-title"><h2>{form.psId ? `Edit ${form.psId}` : "Add problem"}</h2></div>
          <div className="admin-form-grid">
            <label>Domain
              <select value={form.domainId} onChange={(e) => setForm({ ...form, domainId: e.target.value })}>
                {domains.map((item) => <option key={item.domainId} value={item.domainId}>{item.domainId} - {item.domainName}</option>)}
              </select>
            </label>
            <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
            <label>What to build<textarea value={form.whatToBuild} onChange={(e) => setForm({ ...form, whatToBuild: e.target.value })} required /></label>
          </div>
          <button className="btn btn-brand" type="submit">Save problem</button>
          <button className="btn btn-outline-glass ms-2" type="button" onClick={() => setForm(null)}>Cancel</button>
        </form>
      )}
    </div>
  );
}

function Domains({ domains, token, onRefresh }) {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");

  const save = async (event) => {
    event.preventDefault();
    const response = await apiAdminUpdateDomain(token, form);
    setMessage(response.success ? "Domain saved successfully." : (response.error || "Failed to save domain."));
    if (response.success) { setForm(null); onRefresh(); }
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
                  <td>{domain.status}</td>
                  <td>
                    <button className="btn btn-outline-glass" type="button" onClick={() => setForm({ domainId: domain.domainId, domainName: domain.domainName, maximumTeams: domain.maximumTeams, status: domain.status })}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && <p className="participant-muted" role="status">{message}</p>}
      </Panel>
      {form && (
        <form className="admin-panel glass-card" onSubmit={save}>
          <div className="admin-form-grid">
            <label>Domain name<input value={form.domainName} onChange={(e) => setForm({ ...form, domainName: e.target.value })} required /></label>
            <label>Maximum teams<input type="number" min="0" value={form.maximumTeams} onChange={(e) => setForm({ ...form, maximumTeams: e.target.value })} required /></label>
            <label>Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DISABLED">DISABLED</option>
              </select>
            </label>
          </div>
          <button className="btn btn-brand" type="submit">Save domain</button>
          <button className="btn btn-outline-glass ms-2" type="button" onClick={() => setForm(null)}>Cancel</button>
        </form>
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

  // Authoritative selection list from Selections sheet, falling back to team selections if needed.
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
  const run = async (request, prompt) => {
    if (!window.confirm(prompt)) return;
    await request(token);
    onRefresh();
  };
  return (
    <Panel title="Release control">
      <div className="admin-release-grid">
        <div><span>Problem release (IST)</span><strong>{dateLabel(config.problemReleaseAt)}</strong></div>
        <div><span>Problem close (IST)</span><strong>{dateLabel(config.problemCloseAt)}</strong></div>
      </div>
      <p className="admin-state">Current State: <strong>{config.selectionState}</strong></p>
      <div className="d-flex gap-2 flex-wrap">
        <button className="btn btn-brand" type="button" onClick={() => run(apiAdminReleaseNow, "Release problem selection now?")}>
          Release now
        </button>
        <button className="btn btn-outline-glass" type="button" onClick={() => run(apiAdminOpenSelection, "Open problem selection?")}>
          Open Selection
        </button>
        <button className="btn btn-outline-glass" type="button" onClick={() => run(apiAdminCloseSelection, "Close problem selection?")}>
          Close selection
        </button>
      </div>
    </Panel>
  );
}

function Configuration({ config, token, onRefresh }) {
  const [release, setRelease] = useState(dateInput(config.problemReleaseAt));
  const [close, setClose] = useState(dateInput(config.problemCloseAt));
  const [allowReset, setAllowReset] = useState(Boolean(config.allowSelectionReset));
  const [message, setMessage] = useState("");

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

    const result = await apiAdminUpdateConfiguration(token, {
      problemReleaseAt: releaseIso,
      problemCloseAt: closeIso
    });
    setMessage(result.success ? "Configuration saved." : (result.error || "Failed to save configuration."));
    if (result.success) onRefresh();
  };

  const toggleReset = async () => {
    const newFlag = !allowReset;
    const confirmMsg = newFlag
      ? "Enable ALLOW_SELECTION_RESET? This permits admins to remove selections."
      : "Disable ALLOW_SELECTION_RESET? This prevents all selection resets.";
    if (!window.confirm(confirmMsg)) return;
    const result = await apiAdminSetAllowReset(token, { allowSelectionReset: newFlag ? "TRUE" : "FALSE" });
    if (result.success) {
      setAllowReset(newFlag);
      setMessage(`ALLOW_SELECTION_RESET set to ${newFlag ? "TRUE" : "FALSE"}.`);
      onRefresh();
    } else {
      setMessage(result.error);
    }
  };

  return (
    <div className="admin-content">
      <form className="admin-panel glass-card" onSubmit={saveTiming}>
        <div className="admin-panel-title">
          <h2>Timing configuration (Asia/Kolkata - IST)</h2>
          <span>State: {config.selectionState}</span>
        </div>
        <label>Registration enabled
          <input value={String(config.registrationEnabled)} readOnly />
        </label>
        <label>Registration deadline
          <input value={String(config.registrationDeadline || "N/A")} readOnly />
        </label>
        <label>Problem release (IST)
          <input type="datetime-local" value={release} onChange={(e) => setRelease(e.target.value)} required />
        </label>
        <label>Problem close (IST)
          <input type="datetime-local" value={close} onChange={(e) => setClose(e.target.value)} required />
        </label>
        {message && <p className="participant-muted" role="status" style={{ color: message.toLowerCase().includes("error") || message.toLowerCase().includes("must") || message.toLowerCase().includes("failed") ? "#f87171" : "#4ade80" }}>{message}</p>}
        <button className="btn btn-brand" type="submit">Save timing</button>
      </form>

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