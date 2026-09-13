import { useEffect, useEffectEvent, useRef, useState } from "react";
import { apiGetProblems, apiGetTeam, apiLockProblem } from "../services/appsScriptApi";
import { clearAuthToken, getAuthToken, setAuthToken } from "../services/authSession";

const ERROR_MESSAGES = {
  AUTH_REQUIRED: "Please sign in with your BIT college account.",
  INVALID_TOKEN: "Your Google session has expired. Please sign in again.",
  INVALID_AUDIENCE: "This Google account cannot access the team portal.",
  EMAIL_NOT_VERIFIED: "Please use a verified college Google account.",
  COLLEGE_EMAIL_REQUIRED: "Please sign in with your @bitsathy.ac.in account.",
  TEAM_NOT_REGISTERED: "Only registered team leaders can access the participant portal. Please sign in with the @bitsathy.ac.in account used during team registration.",
  TEAM_DISABLED: "This team is currently disabled. Please contact the organizers.",
  SELECTION_CLOSED: "Problem selection is no longer available.",
  TEAM_ALREADY_LOCKED: "Your team has already locked a problem.",
  PROBLEM_ALREADY_LOCKED: "This problem has already been locked by another team. Please choose another available problem.",
  WRONG_DOMAIN: "This problem is not available for your registered domain.",
  PROBLEM_DISABLED: "This problem is no longer available.",
  INVALID_PROBLEM: "This problem could not be found.",
  NO_PROBLEMS_AVAILABLE: "There are no available problems in your registered domain right now.",
  NETWORK_ERROR: "Unable to reach the team portal. Please check your connection and try again.",
  SERVER_ERROR: "Unable to load your team details. Please try again."
};

function getFriendlyError(response) {
  return ERROR_MESSAGES[response?.code] || ERROR_MESSAGES.SERVER_ERROR;
}

function getErrorTitle(code) {
  if (code === "TEAM_NOT_REGISTERED") return "Team Not Found";
  if (code === "COLLEGE_EMAIL_REQUIRED") return "College account required";
  return "We could not open your portal";
}

function formatDateTime(value) {
  if (!value) return "Release time will be announced soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Release time will be announced soon";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

const localMockIdentity = import.meta.env.VITE_USE_MOCK === "true"
  ? import.meta.env.VITE_MOCK_IDENTITY || ""
  : "";

function ParticipantPortal({ setPage }) {
  const googleButtonRef = useRef(null);
  const [token, setToken] = useState(() => getAuthToken() || localMockIdentity);
  const [team, setTeam] = useState(null);
  const [view, setView] = useState(() => (getAuthToken() ? "loading" : "login"));
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [countdown, setCountdown] = useState("");
  const [problems, setProblems] = useState([]);
  const [problemError, setProblemError] = useState("");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState("");

  const gisInitializedRef = useRef(false);

  const loadProblems = async (idToken) => {
    try {
      const response = await apiGetProblems(idToken);
      if (!response?.success) {
        setProblemError(getFriendlyError(response));
        return;
      }
      setProblemError("");
      setProblems(response.data?.problems || []);
    } catch (err) {
      console.error("loadProblems error:", err);
      setProblemError(getFriendlyError({ code: "NETWORK_ERROR" }));
    }
  };

  const loadTeam = async (idToken) => {
    setView("loading");
    setError("");
    setErrorCode("");
    try {
      const response = await apiGetTeam(idToken);

      if (response?.success) {
        setTeam(response.data);
        if (response.data.problems && Array.isArray(response.data.problems) && response.data.problems.length > 0) {
          setProblems(response.data.problems);
        } else {
          setProblems([]);
          const isTeamLocked = response.data.selectionStatus === "LOCKED" || Boolean(response.data.selection?.psId);
          if (!isTeamLocked && response.data.selectionStatus === "OPEN") {
            await loadProblems(idToken);
          }
        }
        setView("dashboard");
        return;
      }

      if (["INVALID_TOKEN", "INVALID_AUDIENCE", "AUTH_REQUIRED"].includes(response?.code)) {
        clearAuthToken();
        setToken(null);
        setView("login");
      } else {
        setView("error");
      }
      setErrorCode(response?.code || "SERVER_ERROR");
      setError(getFriendlyError(response || {}));
    } catch (err) {
      console.error("loadTeam unexpected exception:", err);
      setView("error");
      setErrorCode("NETWORK_ERROR");
      setError(getFriendlyError({ code: "NETWORK_ERROR" }));
    }
  };

  const loadTeamEvent = useEffectEvent(loadTeam);

  useEffect(() => {
    if (token) Promise.resolve().then(() => loadTeamEvent(token));
  }, [token]);

  useEffect(() => {
    if (view !== "login" || !googleButtonRef.current) return undefined;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const initializeGoogle = () => {
      if (!window.google || !clientId || !googleButtonRef.current) return false;
      if (!gisInitializedRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) {
              setAuthToken(response.credential);
              setToken(response.credential);
              setError("");
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

    if (initializeGoogle()) return undefined;
    const interval = window.setInterval(() => {
      if (initializeGoogle()) window.clearInterval(interval);
    }, 100);
    return () => window.clearInterval(interval);
  }, [view]);

  useEffect(() => {
    if (view !== "dashboard" || (!team?.releaseAt && !team?.closeAt)) {
      return undefined;
    }
    const updateCountdown = () => {
      const target = team.selectionStatus === "OPEN" ? team.closeAt : team.releaseAt;
      const remaining = new Date(target).getTime() - Date.now();
      setCountdown(remaining > 0 ? formatCountdown(remaining) : "00:00:00");
      if (remaining <= 0) loadTeamEvent(token);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [team, view, token]);

  const signOut = () => {
    clearAuthToken();
    setToken(null);
    setTeam(null);
    setError("");
    setView("login");
  };

  const confirmLock = async () => {
    if (!selectedProblem || locking) return;
    setLocking(true);
    setLockError("");
    const response = await apiLockProblem(token, selectedProblem.PSID);
    if (response?.success) {
      setShowConfirmation(false);
      setSelectedProblem(null);
      await loadTeam(token);
    } else {
      setLockError(getFriendlyError(response));
    }
    setLocking(false);
  };

  if (view === "login") {
    return (
      <section className="participant-shell container py-4 py-md-5 px-3">
        <div className="participant-login glass-card mx-auto p-4 p-md-5 text-center">
          <div className="participant-eyebrow"><i className="bi bi-person-check me-2"></i>Participant Portal</div>
          <h1 className="participant-title">Your team, in focus.</h1>
          <p className="participant-copy">Sign in with the college Google account used by your team leader.</p>
          {error && <div className="participant-alert" role="alert"><i className="bi bi-exclamation-triangle me-2"></i>{error}</div>}
          <div className="participant-login-panel">
            <span className="participant-panel-label">TEAM LEADER LOGIN</span>
            <div ref={googleButtonRef} className="participant-google-button"></div>
            {!import.meta.env.VITE_GOOGLE_CLIENT_ID && <p className="participant-muted mb-0">Google sign-in is not configured for this environment.</p>}
          </div>
          <button className="btn btn-outline-glass mt-4" onClick={() => setPage("home")} type="button"><i className="bi bi-arrow-left me-2"></i>Back to homepage</button>
        </div>
      </section>
    );
  }

  if (view === "loading") {
    return <section className="participant-shell container py-4 py-md-5 px-3"><div className="participant-state glass-card mx-auto p-5 text-center"><div className="spinner-border text-info mb-3" role="status" aria-label="Loading"></div><p className="participant-muted mb-0">Verifying account and loading dashboard...</p></div></section>;
  }

  if (view === "error") {
    return (
      <section className="participant-shell container py-4 py-md-5 px-3">
        <div className="participant-state glass-card mx-auto p-4 p-md-5 text-center">
          <i className="bi bi-shield-exclamation participant-state-icon"></i><h1 className="h3 text-light fw-bold">{getErrorTitle(errorCode)}</h1><p className="participant-muted">{error}</p>
          <div className="d-flex flex-column flex-sm-row justify-content-center gap-2"><button className="btn btn-brand" onClick={signOut} type="button">Back to login</button>{errorCode !== "TEAM_NOT_REGISTERED" && <button className="btn btn-outline-glass" onClick={() => loadTeam(token)} type="button">Try again</button>}</div>
        </div>
      </section>
    );
  }

  const isLocked = team.selectionStatus === "LOCKED";
  const isOpen = team.selectionStatus === "OPEN";
  const isClosed = team.selectionStatus === "CLOSED";
  const statusLabel = isLocked ? "Selected & locked" : isOpen ? "Selection open" : isClosed ? "Selection closed" : "Not yet released";

  return (
    <section className="participant-shell container py-4 py-md-5 px-3">
      <div className="participant-header d-flex flex-column flex-md-row justify-content-between gap-3 mb-4"><div><div className="participant-eyebrow">Team Portal / {team.teamId}</div><h1 className="participant-title mb-1">{team.teamName}</h1><p className="participant-muted mb-0">Your registered team dashboard</p></div><button className="btn btn-outline-glass align-self-start" onClick={signOut} type="button"><i className="bi bi-box-arrow-right me-2"></i>Sign out</button></div>
      <div className="row g-3 g-lg-4">
        <div className="col-12 col-lg-7"><div className="participant-panel glass-card h-100"><div className="participant-panel-heading"><span>TEAM DETAILS</span><i className="bi bi-fingerprint"></i></div><div className="participant-team-id">{team.teamId}</div><div className="participant-detail-grid"><div><span>Team name</span><strong>{team.teamName}</strong></div><div><span>Registration status</span><strong className="text-success">Registered</strong></div><div><span>Leader</span><strong>{team.leaderName}</strong><small>{team.leaderDepartment}</small></div><div><span>Leader account</span><strong className="participant-email">{team.leaderEmail}</strong><small>{team.leaderRegisterNumber}</small></div></div></div></div>
        <div className="col-12 col-lg-5"><div className="participant-panel participant-domain-panel glass-card h-100"><div className="participant-panel-heading"><span>REGISTERED DOMAIN</span><i className="bi bi-diagram-3"></i></div><div className="participant-domain-mark">{team.domainId}</div><h2>{team.domainName}</h2><p className="participant-muted mb-0">This domain was selected during team registration.</p></div></div>
        <div className="col-12 col-md-6"><div className="participant-panel glass-card h-100"><div className="participant-panel-heading"><span>TEAM MEMBERS</span><i className="bi bi-people"></i></div><div className="participant-members-list"><div className="participant-member"><span className="participant-member-index">L</span><div><strong>{team.leaderName}</strong><small>Leader / {team.leaderDepartment}</small></div></div>{team.members.map((member, index) => <div className="participant-member" key={`${member.registerNumber}-${index}`}><span className="participant-member-index">{index + 1}</span><div><strong>{member.name}</strong><small>{member.registerNumber} / {member.department}</small></div></div>)}</div></div></div>
        <div className="col-12"><div className={`participant-panel participant-release-panel glass-card ${isOpen ? "is-open" : ""}`}><div className="participant-panel-heading"><span>PROBLEM SELECTION</span><i className="bi bi-hourglass-split"></i></div><div className="participant-status-line"><span className={`participant-status-dot ${isOpen ? "open" : ""}`}></span><strong>{statusLabel}</strong></div>{isLocked && team.selection ? <div className="participant-selection-note"><span>Your problem statement</span><strong>{team.selection.psId} - {team.selection.problemTitle || team.selection.problem?.title || team.selection.psId}</strong><small>Status: LOCKED</small><small>Selected at: {formatDateTime(team.selection.selectedAt)}</small><small>This problem is permanently locked to your team.</small></div> : isClosed ? <div className="participant-selection-note is-closed"><strong>Problem selection is closed.</strong><small>No further problem selections can be made.</small></div> : isOpen ? <div><p className="participant-muted">Your registered domain: <strong className="text-light">{team.domainName}</strong></p><p className="participant-muted">Available until: <strong className="text-light">{formatDateTime(team.closeAt)}</strong></p>{problemError && <div className="participant-alert" role="alert">{problemError}</div>}{!problemError && problems.length === 0 ? <p className="participant-muted">No problems are available in this domain right now.</p> : <div className="problem-grid">{problems.map((problem) => <article className="problem-card" key={problem.PSID || problem.psId}><span className="problem-id">{problem.PSID || problem.psId}</span><h2>{problem.Title || problem.title}</h2><p><strong>Description</strong>{problem.Description || problem.description}</p><p><strong>What should you build?</strong>{problem.WhatToBuild || problem.whatToBuild}</p><button className="btn btn-brand" type="button" onClick={() => { setSelectedProblem({ PSID: problem.PSID || problem.psId, Title: problem.Title || problem.title }); setLockError(""); setShowConfirmation(true); }}>Select problem</button></article>)}</div>}</div> : <div className="participant-countdown-wrap"><small>Selection status</small><strong>Problem selection has not been released yet.</strong>{countdown && <div className="participant-countdown">{countdown}</div>}<span>Problem statements will become available when the organizer releases them.</span></div>}</div></div>
      </div>
      {showConfirmation && selectedProblem && <div className="phase6-modal-backdrop" role="presentation"><div className="phase6-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-problem-title"><button className="phase6-modal-close" type="button" aria-label="Cancel" onClick={() => !locking && setShowConfirmation(false)}><i className="bi bi-x-lg"></i></button><span className="participant-eyebrow">Confirm problem selection</span><h2 id="confirm-problem-title">{selectedProblem.PSID} - {selectedProblem.Title}</h2><p className="participant-muted">Once confirmed, this problem will be permanently locked to your team.</p>{lockError && <div className="participant-alert" role="alert">{lockError}</div>}<div className="d-flex flex-column flex-sm-row gap-2 justify-content-end"><button className="btn btn-outline-glass" type="button" disabled={locking} onClick={() => setShowConfirmation(false)}>Cancel</button><button className="btn btn-brand" type="button" disabled={locking} onClick={confirmLock}>{locking ? "Locking..." : "Confirm & Lock"}</button></div></div></div>}
    </section>
  );
}

export default ParticipantPortal;
