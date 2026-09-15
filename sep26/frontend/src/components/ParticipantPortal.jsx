import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  apiGetMyFeedbackStatus,
  apiGetMyFinalSubmissionStatus,
  apiGetProblems,
  apiGetTeam,
  apiLockProblem,
  apiSubmitFeedback,
  apiSubmitFinalSubmission
} from "../services/appsScriptApi";
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
  NO_LOCKED_SELECTION: "A locked problem selection is required before submitting feedback.",
  NO_PROBLEM_SELECTED: "Your team has not selected a problem statement yet.",
  FEEDBACK_ALREADY_SUBMITTED: "Feedback has already been submitted for this team.",
  FINAL_SUBMISSION_ALREADY_SUBMITTED: "Final submission has already been submitted for your team.",
  FINAL_SUBMISSION_CLOSED: "Final submissions have passed the deadline.",
  INVALID_FEEDBACK: "Please provide valid feedback text.",
  INVALID_FINAL_SUBMISSION: "Please provide valid final submission content.",
  NETWORK_ERROR: "Unable to reach the team portal. Please check your connection and try again.",
  SERVER_ERROR: "Unable to load your team details. Please try again."
};

function getFriendlyError(response) {
  return ERROR_MESSAGES[response?.code] || response?.error || ERROR_MESSAGES.SERVER_ERROR;
}

function getErrorTitle(code) {
  if (code === "TEAM_NOT_REGISTERED") return "Team Not Found";
  if (code === "COLLEGE_EMAIL_REQUIRED") return "College account required";
  return "We could not open your portal";
}

function parseIsoOrCustomDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;

  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const min = Number(match[5] || 0);
    const sec = Number(match[6] || 0);
    d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatDateTime(value) {
  if (!value) return "Release time will be announced soon";
  const date = parseIsoOrCustomDate(value);
  if (!date) return "Release time will be announced soon";
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

  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSuccess, setFeedbackSuccess] = useState("");

  const [finalSubmitted, setFinalSubmitted] = useState(false);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalFeedbackText, setFinalFeedbackText] = useState("");
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [finalError, setFinalError] = useState("");
  const [finalSuccess, setFinalSuccess] = useState("");

  const gisInitializedRef = useRef(false);
  const hasRefetchedForReleaseRef = useRef(false);

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

  const loadFeedbackStatus = async (idToken) => {
    try {
      const response = await apiGetMyFeedbackStatus(idToken);
      if (response?.success) {
        setFeedbackSubmitted(Boolean(response.submitted));
      }
    } catch (err) {
      console.error("loadFeedbackStatus error:", err);
    }
  };

  const loadFinalSubmissionStatus = async (idToken) => {
    try {
      const response = await apiGetMyFinalSubmissionStatus(idToken);
      if (response?.success) {
        setFinalSubmitted(Boolean(response.submitted));
      }
    } catch (err) {
      console.error("loadFinalSubmissionStatus error:", err);
    }
  };

  const loadTeam = async (idToken, isBackground = false) => {
    if (!isBackground) {
      setView("loading");
      setError("");
      setErrorCode("");
    }
    try {
      const response = await apiGetTeam(idToken);

      if (response?.success) {
        setTeam(response.data);
        if (response.data.problems && Array.isArray(response.data.problems) && response.data.problems.length > 0) {
          setProblems(response.data.problems);
        } else {
          const isTeamLocked = response.data.selectionStatus === "LOCKED" || Boolean(response.data.selection?.psId);
          if (!isTeamLocked && response.data.selectionStatus === "OPEN") {
            await loadProblems(idToken);
          } else {
            setProblems([]);
          }
        }
        await loadFeedbackStatus(idToken);
        await loadFinalSubmissionStatus(idToken);
        setView("dashboard");
        return;
      }

      if (!isBackground) {
        if (["INVALID_TOKEN", "INVALID_AUDIENCE", "AUTH_REQUIRED"].includes(response?.code)) {
          clearAuthToken();
          setToken(null);
          setView("login");
        } else {
          setView("error");
        }
        setErrorCode(response?.code || "SERVER_ERROR");
        setError(getFriendlyError(response || {}));
      }
    } catch (err) {
      console.error("loadTeam unexpected exception:", err);
      if (!isBackground) {
        setView("error");
        setErrorCode("NETWORK_ERROR");
        setError(getFriendlyError({ code: "NETWORK_ERROR" }));
      }
    }
  };

  const loadTeamEvent = useEffectEvent(loadTeam);

  useEffect(() => {
    if (token) Promise.resolve().then(() => loadTeamEvent(token, false));
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
      const isCurrentlyOpen = team.selectionStatus === "OPEN";
      const targetVal = isCurrentlyOpen ? team.closeAt : team.releaseAt;
      const targetDate = parseIsoOrCustomDate(targetVal);

      if (!targetDate) {
        setCountdown("");
        return;
      }

      const remaining = targetDate.getTime() - Date.now();
      if (remaining > 0) {
        setCountdown(formatCountdown(remaining));
      } else {
        setCountdown("00:00:00");
        if (!isCurrentlyOpen && team.selectionStatus === "NOT_RELEASED" && !hasRefetchedForReleaseRef.current) {
          hasRefetchedForReleaseRef.current = true;
          loadTeamEvent(token, true);
        }
      }
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

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setFeedbackError("Please enter your feedback before submitting.");
      return;
    }
    if (trimmed.length > 2000) {
      setFeedbackError("Feedback exceeds maximum length of 2000 characters.");
      return;
    }
    setSubmittingFeedback(true);
    setFeedbackError("");
    setFeedbackSuccess("");

    try {
      const response = await apiSubmitFeedback(token, { feedback: trimmed });
      if (response?.success) {
        setFeedbackSuccess("Feedback submitted successfully.");
        setFeedbackSubmitted(true);
        setTimeout(() => {
          setShowFeedbackModal(false);
          setFeedbackSuccess("");
          setFeedbackText("");
        }, 1200);
      } else {
        setFeedbackError(getFriendlyError(response));
      }
    } catch (err) {
      console.error("handleSubmitFeedback error:", err);
      setFeedbackError("An unexpected error occurred while submitting feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleSubmitFinalSubmission = async (e) => {
    e.preventDefault();
    const trimmed = finalFeedbackText.trim();
    if (!trimmed) {
      setFinalError("Please enter your final submission details before submitting.");
      return;
    }
    if (trimmed.length > 5000) {
      setFinalError("Submission feedback exceeds maximum length of 5000 characters.");
      return;
    }
    setSubmittingFinal(true);
    setFinalError("");
    setFinalSuccess("");

    try {
      const response = await apiSubmitFinalSubmission(token, { feedback: trimmed });
      if (response?.success) {
        setFinalSuccess("Final submission submitted successfully!");
        setFinalSubmitted(true);
        setTimeout(() => {
          setShowFinalModal(false);
          setFinalSuccess("");
          setFinalFeedbackText("");
        }, 1200);
      } else {
        setFinalError(getFriendlyError(response));
      }
    } catch (err) {
      console.error("handleSubmitFinalSubmission error:", err);
      setFinalError("An unexpected error occurred while submitting your final submission.");
    } finally {
      setSubmittingFinal(false);
    }
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

  const psId = String(team.selection?.psId || team.selection?.PSID || "").trim().toUpperCase();

  return (
    <section className="participant-shell container py-4 py-md-5 px-3">
      <div className="participant-header d-flex flex-column flex-md-row justify-content-between gap-3 mb-4">
        <div>
          <div className="participant-eyebrow">Team Portal / {team.teamId}</div>
          <h1 className="participant-title mb-1">{team.teamName}</h1>
          <p className="participant-muted mb-0">Your registered team dashboard</p>
        </div>
        <div className="d-flex align-items-center gap-2 align-self-start flex-wrap">
          {finalSubmitted ? (
            <button className="btn btn-outline-glass text-success" type="button" disabled title="Final submission has already been completed for your team.">
              <i className="bi bi-check-circle-fill me-2"></i>Final Submitted
            </button>
          ) : (
            <button
              className="btn btn-brand bg-gradient"
              type="button"
              onClick={() => {
                setFinalFeedbackText("");
                setFinalError("");
                setFinalSuccess("");
                setShowFinalModal(true);
              }}
            >
              <i className="bi bi-send-check me-2"></i>Final Submission
            </button>
          )}

          {feedbackSubmitted ? (
            <button className="btn btn-outline-glass text-success" type="button" disabled title="Feedback has already been submitted for this team.">
              <i className="bi bi-check-circle-fill me-2"></i>Feedback Submitted
            </button>
          ) : (
            <button
              className="btn btn-outline-glass"
              type="button"
              onClick={() => {
                setFeedbackText("");
                setFeedbackError("");
                setFeedbackSuccess("");
                setShowFeedbackModal(true);
              }}
            >
              <i className="bi bi-chat-square-text me-2"></i>Feedback
            </button>
          )}

          <button className="btn btn-outline-glass" onClick={signOut} type="button">
            <i className="bi bi-box-arrow-right me-2"></i>Sign out
          </button>
        </div>
      </div>

      <div className="row g-3 g-lg-4">
        <div className="col-12 col-lg-7"><div className="participant-panel glass-card h-100"><div className="participant-panel-heading"><span>TEAM DETAILS</span><i className="bi bi-fingerprint"></i></div><div className="participant-team-id">{team.teamId}</div><div className="participant-detail-grid"><div><span>Team name</span><strong>{team.teamName}</strong></div><div><span>Registration status</span><strong className="text-success">Registered</strong></div><div><span>Leader</span><strong>{team.leaderName}</strong><small>{team.leaderDepartment}</small></div><div><span>Leader account</span><strong className="participant-email">{team.leaderEmail}</strong><small>{team.leaderRegisterNumber}</small></div></div></div></div>
        <div className="col-12 col-lg-5"><div className="participant-panel participant-domain-panel glass-card h-100"><div className="participant-panel-heading"><span>REGISTERED DOMAIN</span><i className="bi bi-diagram-3"></i></div><div className="participant-domain-mark">{team.domainId}</div><h2>{team.domainName}</h2><p className="participant-muted mb-0">This domain was selected during team registration.</p></div></div>
        <div className="col-12 col-md-6"><div className="participant-panel glass-card h-100"><div className="participant-panel-heading"><span>TEAM MEMBERS</span><i className="bi bi-people"></i></div><div className="participant-members-list"><div className="participant-member"><span className="participant-member-index">L</span><div><strong>{team.leaderName}</strong><small>Leader / {team.leaderDepartment}</small></div></div>{team.members.map((member, index) => <div className="participant-member" key={`${member.registerNumber}-${index}`}><span className="participant-member-index">{index + 1}</span><div><strong>{member.name}</strong><small>{member.registerNumber} / {member.department}</small></div></div>)}</div></div></div>
        <div className="col-12"><div className={`participant-panel participant-release-panel glass-card ${isOpen ? "is-open" : ""}`}><div className="participant-panel-heading"><span>PROBLEM SELECTION</span><i className="bi bi-hourglass-split"></i></div><div className="participant-status-line"><span className={`participant-status-dot ${isOpen ? "open" : ""}`}></span><strong>{statusLabel}</strong></div>{isLocked && team.selection ? <div className="participant-selection-note"><span>Your problem statement</span><strong>{team.selection.psId} - {team.selection.problemTitle || team.selection.problem?.title || team.selection.psId}</strong><small>Status: LOCKED</small><small>Selected at: {formatDateTime(team.selection.selectedAt)}</small><small>This problem is permanently locked to your team.</small></div> : isClosed ? <div className="participant-selection-note is-closed"><strong>Problem selection is closed.</strong><small>No further problem selections can be made.</small></div> : isOpen ? <div><p className="participant-muted">Your registered domain: <strong className="text-light">{team.domainName}</strong></p><p className="participant-muted">Available until: <strong className="text-light">{formatDateTime(team.closeAt)}</strong></p>{problemError && <div className="participant-alert" role="alert">{problemError}</div>}{!problemError && problems.length === 0 ? <p className="participant-muted">No problems are available in this domain right now.</p> : <div className="problem-grid">{problems.map((problem) => <article className="problem-card" key={problem.PSID || problem.psId}><span className="problem-id">{problem.PSID || problem.psId}</span><h2>{problem.Title || problem.title}</h2><p><strong>Description</strong>{problem.Description || problem.description}</p><p><strong>What should you build?</strong>{problem.WhatToBuild || problem.whatToBuild}</p><button className="btn btn-brand" type="button" onClick={() => { setSelectedProblem({ PSID: problem.PSID || problem.psId, Title: problem.Title || problem.title }); setLockError(""); setShowConfirmation(true); }}>Select problem</button></article>)}</div>}</div> : <div className="participant-countdown-wrap"><small>Selection status</small><strong>Problem selection has not been released yet.</strong>{countdown && <div className="participant-countdown">{countdown}</div>}<span>Problem statements will become available when the organizer releases them.</span></div>}</div></div>
      </div>

      {showConfirmation && selectedProblem && <div className="phase6-modal-backdrop" role="presentation"><div className="phase6-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-problem-title"><button className="phase6-modal-close" type="button" aria-label="Cancel" onClick={() => !locking && setShowConfirmation(false)}><i className="bi bi-x-lg"></i></button><span className="participant-eyebrow">Confirm problem selection</span><h2 id="confirm-problem-title">{selectedProblem.PSID} - {selectedProblem.Title}</h2><p className="participant-muted">Once confirmed, this problem will be permanently locked to your team.</p>{lockError && <div className="participant-alert" role="alert">{lockError}</div>}<div className="d-flex flex-column flex-sm-row gap-2 justify-content-end"><button className="btn btn-outline-glass" type="button" disabled={locking} onClick={() => setShowConfirmation(false)}>Cancel</button><button className="btn btn-brand" type="button" disabled={locking} onClick={confirmLock}>{locking ? "Locking..." : "Confirm & Lock"}</button></div></div></div>}

      {showFeedbackModal && (
        <div className="phase6-modal-backdrop" role="presentation">
          <div className="phase6-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
            <button
              className="phase6-modal-close"
              type="button"
              aria-label="Cancel"
              disabled={submittingFeedback}
              onClick={() => {
                if (!submittingFeedback) {
                  setShowFeedbackModal(false);
                  setFeedbackError("");
                  setFeedbackSuccess("");
                }
              }}
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <span className="participant-eyebrow">Feedback</span>
            <h2 id="feedback-modal-title" className="mb-2">How was your hackathon experience?</h2>
            <p className="participant-muted mb-3">
              Your feedback helps us improve future events.
            </p>

            {feedbackError && (
              <div className="participant-alert mb-3" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                {feedbackError}
              </div>
            )}

            {feedbackSuccess && (
              <div className="alert alert-success bg-success bg-opacity-25 text-light border-0 mb-3" role="alert">
                <i className="bi bi-check-circle-fill me-2 text-success"></i>
                {feedbackSuccess}
              </div>
            )}

            <form onSubmit={handleSubmitFeedback}>
              <div className="mb-3">
                <textarea
                  className="form-control bg-dark text-light border-secondary p-3"
                  rows={5}
                  maxLength={2000}
                  placeholder="Share your thoughts about the problem statements, mentorship, arrangements, or platform experience..."
                  value={feedbackText}
                  onChange={(e) => {
                    setFeedbackText(e.target.value);
                    if (feedbackError) setFeedbackError("");
                  }}
                  disabled={submittingFeedback || Boolean(feedbackSuccess)}
                  required
                  style={{ resize: "vertical", minHeight: "120px" }}
                />
                <div className="d-flex justify-content-between align-items-center mt-2 text-muted" style={{ fontSize: "0.825rem" }}>
                  <span>Characters: {feedbackText.length} / 2000</span>
                </div>
              </div>

              <div className="d-flex flex-column flex-sm-row gap-2 justify-content-end">
                <button
                  className="btn btn-outline-glass"
                  type="button"
                  disabled={submittingFeedback}
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setFeedbackError("");
                    setFeedbackSuccess("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-brand"
                  type="submit"
                  disabled={submittingFeedback || Boolean(feedbackSuccess) || !feedbackText.trim()}
                >
                  {submittingFeedback ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Submitting...
                    </>
                  ) : (
                    "Submit Feedback"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFinalModal && (
        <div className="phase6-modal-backdrop" role="presentation">
          <div className="phase6-modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="final-modal-title">
            <button
              className="phase6-modal-close"
              type="button"
              aria-label="Cancel"
              disabled={submittingFinal}
              onClick={() => {
                if (!submittingFinal) {
                  setShowFinalModal(false);
                  setFinalError("");
                  setFinalSuccess("");
                }
              }}
            >
              <i className="bi bi-x-lg"></i>
            </button>
            <span className="participant-eyebrow"><i className="bi bi-award me-1"></i>Final Project Submission</span>
            <h2 id="final-modal-title" className="mb-2">Submit Your Hackathon Solution</h2>
            <p className="participant-muted mb-4">
              Please review your team information and provide your final project details/feedback below.
            </p>

            {!psId ? (
              <div className="participant-alert mb-3" role="alert">
                <i className="bi bi-exclamation-octagon-fill me-2"></i>
                Your team has not selected a problem statement yet. You must lock a problem statement before making your final submission.
              </div>
            ) : (
              <>
                <div className="row g-2 mb-4">
                  <div className="col-12 col-sm-6 col-md-4">
                    <div className="p-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 rounded">
                      <small className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>Team ID</small>
                      <strong className="text-light">{team.teamId}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6 col-md-4">
                    <div className="p-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 rounded">
                      <small className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>Team Name</small>
                      <strong className="text-light">{team.teamName}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6 col-md-4">
                    <div className="p-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 rounded">
                      <small className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>Problem Statement ID</small>
                      <strong className="text-info">{psId}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6 col-md-6">
                    <div className="p-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 rounded">
                      <small className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>Team Lead Name</small>
                      <strong className="text-light">{team.leaderName}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-sm-6 col-md-6">
                    <div className="p-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 rounded">
                      <small className="text-muted d-block text-uppercase fw-semibold" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>Team Lead Email</small>
                      <strong className="text-light participant-email">{team.leaderEmail}</strong>
                    </div>
                  </div>
                </div>

                {finalError && (
                  <div className="participant-alert mb-3" role="alert">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    {finalError}
                  </div>
                )}

                {finalSuccess && (
                  <div className="alert alert-success bg-success bg-opacity-25 text-light border-0 mb-3" role="alert">
                    <i className="bi bi-check-circle-fill me-2 text-success"></i>
                    {finalSuccess}
                  </div>
                )}

                <form onSubmit={handleSubmitFinalSubmission}>
                  <div className="mb-3">
                    <label className="form-label text-light fw-semibold small">
                      Final Submission Details / Feedback <span className="text-danger">*</span>
                    </label>
                    <textarea
                      className="form-control bg-dark text-light border-secondary p-3"
                      rows={6}
                      maxLength={5000}
                      placeholder="Provide detailed feedback on your project, solution description, repository links, challenges faced, or key outcomes..."
                      value={finalFeedbackText}
                      onChange={(e) => {
                        setFinalFeedbackText(e.target.value);
                        if (finalError) setFinalError("");
                      }}
                      disabled={submittingFinal || Boolean(finalSuccess)}
                      required
                      style={{ resize: "vertical", minHeight: "150px" }}
                    />
                    <div className="d-flex justify-content-between align-items-center mt-2 text-muted" style={{ fontSize: "0.825rem" }}>
                      <span>Characters: {finalFeedbackText.length} / 5000</span>
                      <span>Maximum 5,000 characters allowed</span>
                    </div>
                  </div>

                  <div className="d-flex flex-column flex-sm-row gap-2 justify-content-end">
                    <button
                      className="btn btn-outline-glass"
                      type="button"
                      disabled={submittingFinal}
                      onClick={() => {
                        setShowFinalModal(false);
                        setFinalError("");
                        setFinalSuccess("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-brand"
                      type="submit"
                      disabled={submittingFinal || Boolean(finalSuccess) || !finalFeedbackText.trim()}
                    >
                      {submittingFinal ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Submitting...
                        </>
                      ) : (
                        "Submit Final Project"
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default ParticipantPortal;
