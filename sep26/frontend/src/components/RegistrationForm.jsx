import { useState, useEffect, useRef } from "react";
import { apiRegisterTeam, apiGetDomains } from "../services/appsScriptApi";
import { getAuthToken, setAuthToken } from "../services/authSession";

const DOMAIN_OPTIONS = [
  { id: "AGR", name: "Agriculture & Rural Development" },
  { id: "EMP", name: "Skills, Employment & Entrepreneurship" },
  { id: "EDU", name: "Education & Knowledge" },
  { id: "GOV", name: "Government & Public Services" }
];

const emptyMember = { name: "", registerNumber: "", department: "" };

function getEmailFromJwt(token) {
  if (!token) return "";
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.email || "";
    }
  } catch {
    // Non-JWT token
  }
  return "";
}

function validateAndNormalizeMobile(input) {
  const text = String(input || "").trim();
  let cleaned = text.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  return { valid: false, normalized: "" };
}

function RegistrationForm({ onSuccess, initialDomainId }) {
  const [selectedDomainId, setSelectedDomainId] = useState(initialDomainId || "AGR");
  const [domains, setDomains] = useState(DOMAIN_OPTIONS);
  const [teamName, setTeamName] = useState("");
  const [leader, setLeader] = useState(emptyMember);
  const [leaderMobile, setLeaderMobile] = useState("");
  const [member1, setMember1] = useState(emptyMember);
  const [member2, setMember2] = useState(emptyMember);
  const [member3, setMember3] = useState(emptyMember);

  const [authenticatedEmail, setAuthenticatedEmail] = useState(() => {
    const token = getAuthToken();
    return getEmailFromJwt(token);
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return Boolean(getAuthToken());
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRegistrationClosed, setIsRegistrationClosed] = useState(false);

  const googleButtonRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function loadDomainCapacities() {
      try {
        const idToken = getAuthToken() || "";
        const response = await apiGetDomains(idToken);
        if (mounted && response && response.success && Array.isArray(response.data)) {
          const fetchedMap = {};
          response.data.forEach((d) => {
            fetchedMap[String(d.domainId).toUpperCase()] = d;
          });

          const updated = DOMAIN_OPTIONS.map((d) => {
            const live = fetchedMap[d.id];
            return {
              ...d,
              remainingCapacity: live ? live.remainingCapacity : 10,
              maximumTeams: live ? live.maximumTeams : 10,
              available: live ? live.remainingCapacity > 0 : true
            };
          });
          setDomains(updated);
        }
      } catch {
        // Fallback to static domain options
      }
    }
    loadDomainCapacities();
    return () => {
      mounted = false;
    };
  }, []);

  // Handle Google Login Initialization
  useEffect(() => {
    if (isAuthenticated) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const initGis = () => {
      if (window.google && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            if (res.credential) {
              setAuthToken(res.credential);
              setIsAuthenticated(true);
              const extractedEmail = getEmailFromJwt(res.credential);
              if (extractedEmail) {
                setAuthenticatedEmail(extractedEmail);
              }
              setError("");
            }
          }
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular"
        });
      }
    };

    if (window.google) {
      initGis();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGis();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const token = getAuthToken();
    if (!token) {
      setError("Google authentication is required before team registration.");
      return;
    }

    if (!selectedDomainId) {
      setError("Please select a hackathon domain.");
      return;
    }

    // Validate Team Leader Mobile
    const mobileCheck = validateAndNormalizeMobile(leaderMobile);
    if (!mobileCheck.valid) {
      setError("Leader mobile number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
      return;
    }

    // Validate Team Leader Details
    if (!leader.name.trim() || !leader.registerNumber.trim() || !leader.department.trim()) {
      setError("Please complete all team leader details.");
      return;
    }

    // Validate Member 1 (Required)
    if (!member1.name.trim() || !member1.registerNumber.trim() || !member1.department.trim()) {
      setError("Member 1 is required for a minimum team size of 2 members.");
      return;
    }

    // Validate Member 2 (Optional - must be fully filled if partially filled)
    const m2Filled = Boolean(member2.name.trim() || member2.registerNumber.trim() || member2.department.trim());
    if (m2Filled && (!member2.name.trim() || !member2.registerNumber.trim() || !member2.department.trim())) {
      setError("Please complete all details for Member 2 or leave them blank.");
      return;
    }

    // Validate Member 3 (Optional - must be fully filled if partially filled)
    const m3Filled = Boolean(member3.name.trim() || member3.registerNumber.trim() || member3.department.trim());
    if (m3Filled && (!member3.name.trim() || !member3.registerNumber.trim() || !member3.department.trim())) {
      setError("Please complete all details for Member 3 or leave them blank.");
      return;
    }

    // Prepare submitted members array (1 to 3 additional members)
    const membersToSubmit = [
      { name: member1.name.trim(), registerNumber: member1.registerNumber.trim(), department: member1.department.trim() }
    ];

    if (m2Filled) {
      membersToSubmit.push({
        name: member2.name.trim(),
        registerNumber: member2.registerNumber.trim(),
        department: member2.department.trim()
      });
    }

    if (m3Filled) {
      membersToSubmit.push({
        name: member3.name.trim(),
        registerNumber: member3.registerNumber.trim(),
        department: member3.department.trim()
      });
    }

    // Duplicate Register Number Check within team
    const allRegisterNumbers = [
      leader.registerNumber.trim().toUpperCase(),
      ...membersToSubmit.map((m) => m.registerNumber.trim().toUpperCase())
    ];

    const uniqueNumbers = new Set(allRegisterNumbers);
    if (uniqueNumbers.size !== allRegisterNumbers.length) {
      setError("The same register number cannot appear more than once in a team.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiRegisterTeam(token, {
        domainId: selectedDomainId,
        teamName: teamName.trim(),
        leaderName: leader.name.trim(),
        leaderEmail: authenticatedEmail || undefined,
        leaderMobile: mobileCheck.normalized,
        leaderRegisterNumber: leader.registerNumber.trim(),
        leaderDepartment: leader.department.trim(),
        members: membersToSubmit
      });

      if (response && response.success === true) {
        const teamId = response.data && response.data.teamId;
        const assignedDomain = (response.data && response.data.domainId) || selectedDomainId;
        const selectedDomainObj = domains.find((d) => d.id === assignedDomain) || { name: assignedDomain };

        onSuccess({
          teamId: teamId,
          teamName: teamName.trim(),
          domainId: assignedDomain,
          domainName: selectedDomainObj.name,
          leaderName: leader.name.trim()
        });
      } else {
        if (response && response.code === "REGISTRATION_CLOSED") {
          setIsRegistrationClosed(true);
          setError("");
        } else {
          setError(response.error || response.message || "Team registration failed. Please check inputs.");
        }
      }
    } catch (err) {
      setError(err.message || "Failed to submit registration to Apps Script backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4 py-md-5 px-3" style={{ maxWidth: 840 }}>
      <div className="glass-card p-3 p-sm-4 p-md-5">
        <div className="text-center mb-4">
          <span className="organizer-tag">Registration Flow</span>
          <h2 className="text-light fw-bold mb-2 fs-3 fs-md-2">Team Registration</h2>
          <p className="text-info fw-semibold mb-1 small">
            Team size must be 2–4 members, including the team leader.
          </p>
          <div className="text-warning fw-semibold small mt-2">
            <i className="bi bi-clock-history me-1"></i>
            Registration Deadline: 12 September 2026, 12:00 PM IST
          </div>
        </div>

        {!isAuthenticated && (
          <div className="alert alert-warning text-center p-3 p-md-4 mb-4">
            <h5 className="fw-bold mb-2 fs-5">Google Login Required</h5>
            <p className="small mb-3">Sign in with your official @bitsathy.ac.in Google account to register your team.</p>
            <div ref={googleButtonRef} className="d-flex justify-content-center"></div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* STEP 1: CHOOSE DOMAIN */}
          <div className="mb-4 p-3 border border-secondary border-opacity-25 rounded-3 bg-dark bg-opacity-50">
            <label className="form-label text-light fw-bold mb-2">
              <i className="bi bi-diagram-3 text-primary me-2"></i> Select Hackathon Domain
            </label>
            <div className="row g-2">
              {domains.map((dom) => {
                const isSelected = selectedDomainId === dom.id;
                const isFull = dom.remainingCapacity === 0;

                return (
                  <div className="col-12 col-md-6" key={dom.id}>
                    <div
                      className={`p-3 rounded-3 border text-start transition-all ${
                        isSelected
                          ? "border-primary bg-primary bg-opacity-20 text-light"
                          : "border-secondary border-opacity-25 bg-dark text-secondary"
                      } ${isFull ? "opacity-50" : ""}`}
                      onClick={() => {
                        if (!isFull) setSelectedDomainId(dom.id);
                      }}
                      style={{ cursor: isFull ? "not-allowed" : "pointer" }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-1">
                        <strong className={isSelected ? "text-primary" : "text-light"}>{dom.id}</strong>
                        <small className={`badge ${isFull ? "bg-danger" : "bg-success"}`}>
                          {isFull ? "FULL" : `${dom.remainingCapacity} spots left`}
                        </small>
                      </div>
                      <div className="small fw-semibold">{dom.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 2: TEAM & LEADER DETAILS */}
          <div className="mb-4">
            <label htmlFor="teamNameInput" className="form-label text-light fw-bold">Team Name</label>
            <input
              id="teamNameInput"
              type="text"
              className="form-control dark-input"
              placeholder="Enter team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
          </div>

          <div className="card mb-4 bg-dark bg-opacity-50 border-secondary border-opacity-25">
            <div className="card-header bg-transparent text-primary fw-bold border-secondary border-opacity-25">
              <i className="bi bi-person-badge me-2"></i> Team Leader Details (Required)
            </div>
            <div className="card-body p-3 p-md-4">
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label htmlFor="leaderNameInput" className="form-label text-secondary small">Leader Full Name</label>
                  <input
                    id="leaderNameInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Full name"
                    value={leader.name}
                    onChange={(e) => setLeader({ ...leader, name: e.target.value })}
                    required
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label htmlFor="leaderEmailInput" className="form-label text-secondary small">
                    Leader Google Email {authenticatedEmail && <span className="badge bg-success ms-1">Verified</span>}
                  </label>
                  <input
                    id="leaderEmailInput"
                    type="email"
                    className="form-control dark-input bg-dark bg-opacity-75 text-info"
                    value={authenticatedEmail || "Sign in with Google first"}
                    readOnly
                    disabled
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label htmlFor="leaderRegInput" className="form-label text-secondary small">Register Number</label>
                  <input
                    id="leaderRegInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Register number"
                    value={leader.registerNumber}
                    onChange={(e) => setLeader({ ...leader, registerNumber: e.target.value })}
                    required
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label htmlFor="leaderDeptInput" className="form-label text-secondary small">Department</label>
                  <input
                    id="leaderDeptInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Department (e.g. CSE)"
                    value={leader.department}
                    onChange={(e) => setLeader({ ...leader, department: e.target.value })}
                    required
                  />
                </div>

                <div className="col-12 col-md-4">
                  <label htmlFor="leaderMobileInput" className="form-label text-secondary small">Mobile Number</label>
                  <input
                    id="leaderMobileInput"
                    type="tel"
                    className="form-control dark-input"
                    placeholder="10-digit mobile number"
                    value={leaderMobile}
                    onChange={(e) => setLeaderMobile(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3: MEMBERS */}
          {/* Member 1 (Required) */}
          <div className="card mb-3 bg-dark bg-opacity-50 border-secondary border-opacity-25">
            <div className="card-header bg-transparent text-light fw-bold border-secondary border-opacity-25 d-flex justify-content-between align-items-center">
              <span>Member 1</span>
              <span className="badge bg-danger">Required</span>
            </div>
            <div className="card-body p-3 p-md-4">
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <label htmlFor="m1NameInput" className="form-label text-secondary small d-md-none">Name</label>
                  <input
                    id="m1NameInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Name"
                    value={member1.name}
                    onChange={(e) => setMember1({ ...member1, name: e.target.value })}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m1RegInput" className="form-label text-secondary small d-md-none">Register Number</label>
                  <input
                    id="m1RegInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Register Number"
                    value={member1.registerNumber}
                    onChange={(e) => setMember1({ ...member1, registerNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m1DeptInput" className="form-label text-secondary small d-md-none">Department</label>
                  <input
                    id="m1DeptInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Department"
                    value={member1.department}
                    onChange={(e) => setMember1({ ...member1, department: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Member 2 (Optional) */}
          <div className="card mb-3 bg-dark bg-opacity-50 border-secondary border-opacity-25">
            <div className="card-header bg-transparent text-secondary fw-semibold border-secondary border-opacity-25 d-flex justify-content-between align-items-center">
              <span>Member 2</span>
              <span className="badge bg-secondary">Optional</span>
            </div>
            <div className="card-body p-3 p-md-4">
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <label htmlFor="m2NameInput" className="form-label text-secondary small d-md-none">Name</label>
                  <input
                    id="m2NameInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Name"
                    value={member2.name}
                    onChange={(e) => setMember2({ ...member2, name: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m2RegInput" className="form-label text-secondary small d-md-none">Register Number</label>
                  <input
                    id="m2RegInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Register Number"
                    value={member2.registerNumber}
                    onChange={(e) => setMember2({ ...member2, registerNumber: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m2DeptInput" className="form-label text-secondary small d-md-none">Department</label>
                  <input
                    id="m2DeptInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Department"
                    value={member2.department}
                    onChange={(e) => setMember2({ ...member2, department: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Member 3 (Optional) */}
          <div className="card mb-4 bg-dark bg-opacity-50 border-secondary border-opacity-25">
            <div className="card-header bg-transparent text-secondary fw-semibold border-secondary border-opacity-25 d-flex justify-content-between align-items-center">
              <span>Member 3</span>
              <span className="badge bg-secondary">Optional</span>
            </div>
            <div className="card-body p-3 p-md-4">
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <label htmlFor="m3NameInput" className="form-label text-secondary small d-md-none">Name</label>
                  <input
                    id="m3NameInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Name"
                    value={member3.name}
                    onChange={(e) => setMember3({ ...member3, name: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m3RegInput" className="form-label text-secondary small d-md-none">Register Number</label>
                  <input
                    id="m3RegInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Register Number"
                    value={member3.registerNumber}
                    onChange={(e) => setMember3({ ...member3, registerNumber: e.target.value })}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="m3DeptInput" className="form-label text-secondary small d-md-none">Department</label>
                  <input
                    id="m3DeptInput"
                    type="text"
                    className="form-control dark-input"
                    placeholder="Department"
                    value={member3.department}
                    onChange={(e) => setMember3({ ...member3, department: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {isRegistrationClosed && (
            <div className="alert alert-danger p-4 text-center border-danger border-opacity-50 rounded-3 my-4">
              <h4 className="fw-bold text-light mb-2">Registration Closed</h4>
              <p className="mb-0 text-light opacity-90 fs-6">
                Registration closed on 12 September 2026 at 12:00 PM IST.
              </p>
            </div>
          )}

          {error && <div className="alert alert-danger py-2 mb-4 fs-6">{error}</div>}

          <div className="text-center text-warning fw-semibold small mb-3">
            <i className="bi bi-clock-history me-1"></i>
            Registration Deadline: 12 September 2026, 12:00 PM IST
          </div>

          <button
            type="submit"
            className="btn btn-brand w-100 py-3 fs-5"
            disabled={loading || !isAuthenticated || isRegistrationClosed}
          >
            {isRegistrationClosed ? "Registration Closed" : loading ? "Submitting Registration..." : "Submit Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RegistrationForm;