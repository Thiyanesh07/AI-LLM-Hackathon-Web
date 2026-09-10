import { useState } from "react";
import collegeLogo from "../assets/website_newlogo.jpg";

function AppNavbar({ setPage, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleNav = (target) => {
    setIsOpen(false);
    if (onNavigate) {
      onNavigate(target);
    } else if (setPage) {
      setPage(target);
    }
  };

  const handleAnchorNav = (e, targetId) => {
    e.preventDefault();
    setIsOpen(false);
    handleNav("home");
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }, 100);
  };

  return (
    <nav className="navbar navbar-expand-md navbar-dark bg-dark sticky-top border-bottom border-secondary border-opacity-25 px-3 py-2">
      <div className="container-fluid">
        <button
          className="navbar-brand-custom"
          onClick={() => handleNav("home")}
          type="button"
          aria-label="INTELLIX Home"
        >
          <img src={collegeLogo} alt="Bannari Amman Institute of Technology" />
          <span className="brand-text">INTELLIX</span>
        </button>

        {/* Mobile Hamburger Button */}
        <button
          className="navbar-toggler d-md-none"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label="Toggle navigation menu"
        >
          <i className={`bi ${isOpen ? "bi-x-lg" : "bi-list"} fs-4 text-light`}></i>
        </button>

        {/* Desktop Navigation Links */}
        <div className="d-none d-md-flex ms-auto align-items-center gap-2">
          <button
            className="btn btn-link text-light text-decoration-none btn-sm px-3"
            onClick={() => handleNav("home")}
            type="button"
          >
            Home
          </button>
          <a
            href="#domains"
            className="btn btn-link text-light text-decoration-none btn-sm px-3"
            onClick={(e) => handleAnchorNav(e, "domains")}
          >
            Domains
          </a>
          <a
            href="#journey"
            className="btn btn-link text-light text-decoration-none btn-sm px-3"
            onClick={(e) => handleAnchorNav(e, "journey")}
          >
            Journey
          </a>
          <button
            className="btn btn-brand btn-sm px-4"
            onClick={() => handleNav("register")}
            type="button"
          >
            Register Team
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Navigation Overlay */}
      {isOpen && (
        <div className="w-100 d-md-none px-3 pb-3">
          <div className="mobile-nav-collapse d-flex flex-column gap-2">
            <button
              className="mobile-nav-link"
              onClick={() => handleNav("home")}
              type="button"
            >
              <i className="bi bi-house-door me-3 text-primary"></i> Home
            </button>
            <a
              href="#domains"
              className="mobile-nav-link"
              onClick={(e) => handleAnchorNav(e, "domains")}
            >
              <i className="bi bi-diagram-3 me-3 text-info"></i> Domains
            </a>
            <a
              href="#journey"
              className="mobile-nav-link"
              onClick={(e) => handleAnchorNav(e, "journey")}
            >
              <i className="bi bi-[#818cf8] bi-map me-3 text-warning"></i> Journey
            </a>
            <button
              className="btn btn-brand w-100 py-3 mt-2 fs-6 fw-bold"
              onClick={() => handleNav("register")}
              type="button"
            >
              <i className="bi bi-person-plus me-2"></i> Register Team
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default AppNavbar;