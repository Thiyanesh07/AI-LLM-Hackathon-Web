function SuccessScreen({ registrationData, setPage }) {
  const data = typeof registrationData === "object" && registrationData !== null
    ? registrationData
    : { teamId: registrationData };

  return (
    <div className="container py-4 py-md-5 text-center px-3" style={{ maxWidth: 640 }}>
      <div className="glass-card p-4 p-md-5">
        <div className="mb-3">
          <i className="bi bi-check-circle-fill text-success display-1 fs-1 fs-md-1"></i>
        </div>

        <span className="organizer-tag mb-2">Confirmation</span>
        <h2 className="text-light fw-bold mb-3 fs-3 fs-md-2">REGISTRATION SUCCESSFUL</h2>

        <p className="text-secondary fs-6 fs-md-5 mb-4">
          Your team has been successfully registered.
        </p>

        <div className="bg-dark p-3 p-md-4 rounded-3 border border-secondary border-opacity-25 mb-4 text-start">
          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <small className="text-secondary text-uppercase tracking-wider fw-semibold d-block">Team ID</small>
              <div className="text-warning fw-bold fs-4 text-break">{data.teamId || "BIT-AI-001"}</div>
            </div>
            <div className="col-12 col-sm-6">
              <small className="text-secondary text-uppercase tracking-wider fw-semibold d-block">Team Name</small>
              <div className="text-light fw-semibold fs-5 text-break">{data.teamName || "Registered Team"}</div>
            </div>
            <div className="col-12 col-sm-6">
              <small className="text-secondary text-uppercase tracking-wider fw-semibold d-block">Domain</small>
              <div className="text-info fw-semibold text-break">{data.domainName || data.domainId || "Selected Domain"}</div>
            </div>
            <div className="col-12 col-sm-6">
              <small className="text-secondary text-uppercase tracking-wider fw-semibold d-block">Team Leader</small>
              <div className="text-light fw-semibold text-break">{data.leaderName || "Team Leader"}</div>
            </div>
          </div>
        </div>

        <div className="d-flex flex-column flex-sm-row justify-content-center gap-3">
          <button
            className="btn btn-brand btn-lg px-4 w-100 w-sm-auto"
            onClick={() => setPage("participant")}
          >
            Team Portal (Coming Soon) <i className="bi bi-arrow-right ms-2"></i>
          </button>
          <button
            className="btn btn-outline-glass btn-lg px-4 w-100 w-sm-auto"
            onClick={() => setPage("home")}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default SuccessScreen;