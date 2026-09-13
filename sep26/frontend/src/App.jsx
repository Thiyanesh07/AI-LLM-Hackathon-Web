import { useState, useEffect } from "react";
import AppNavbar from "./components/Navbar";
import Home from "./components/Home";
import RegistrationForm from "./components/RegistrationForm";
import SuccessScreen from "./components/SuccessScreen";
import ParticipantPortal from "./components/ParticipantPortal";
import AdminPortal from "./components/AdminPortal";

function getPageFromPath() {
  const path = window.location.pathname.toLowerCase();
  if (path === "/register") return "register";
  if (path === "/teams" || path === "/participant") return "teams";
  if (path === "/admin") return "admin";
  return "home";
}

function App() {
  const [page, setPage] = useState(getPageFromPath);
  const [registrationData, setRegistrationData] = useState(null);
  const [selectedDomainId, setSelectedDomainId] = useState(null);

  useEffect(() => {
    const onPopState = () => {
      setPage(getPageFromPath());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateTo = (newPage) => {
    setPage(newPage);
    let targetPath = "/";
    if (newPage === "register") targetPath = "/register";
    else if (newPage === "teams") targetPath = "/teams";
    else if (newPage === "admin") targetPath = "/admin";

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, "", targetPath);
    }
  };

  return (
    <div className="min-vh-100 bg-dark text-light d-flex flex-column">
      {page !== "admin" && <AppNavbar setPage={navigateTo} onNavigate={navigateTo} />}
      <main className="flex-grow-1">
        {page === "home" && (
          <Home setPage={navigateTo} setSelectedDomainId={setSelectedDomainId} />
        )}
        {page === "register" && (
          <RegistrationForm
            initialDomainId={selectedDomainId}
            onSuccess={(data) => {
              setRegistrationData(data);
              navigateTo("success");
            }}
          />
        )}
        {page === "success" && (
          <SuccessScreen registrationData={registrationData} setPage={navigateTo} />
        )}
        {page === "teams" && <ParticipantPortal setPage={navigateTo} />}
        {page === "admin" && <AdminPortal setPage={navigateTo} />}
      </main>
    </div>
  );
}

export default App;