import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Compass, ShieldAlert } from 'lucide-react';
import Navbar from './components/Navbar.jsx';
import { Empty, Loading } from './components/ui.jsx';
import { useAuth } from './auth.jsx';
import { useMeta } from './meta.jsx';
import MapPage from './pages/MapPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import NewReportPage from './pages/NewReportPage.jsx';
import ReportDetailPage from './pages/ReportDetailPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import RewardsPage from './pages/RewardsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { LeaderboardPage, SecurityPage, SupportPage } from './pages/SettingsPages.jsx';
import { ForgotPage, LoginPage, RegisterPage, VerifyPage } from './pages/AuthPages.jsx';

/** Route guard: signed in, optionally verified and/or a given role. */
function RequireAuth({ children, verified, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (verified && !user.verified) return <Navigate to="/verify" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) {
    return (
      <div className="page narrow">
        <Empty icon={ShieldAlert} title={role === 'official' ? 'Council staff only' : 'Residents only'} action={<Link to="/" className="btn">Back to home</Link>}>
          {role === 'official' ? 'This page is for council staff accounts.' : 'Staff accounts manage reports from the dashboard.'}
        </Empty>
      </div>
    );
  }
  return children;
}

// Old /reports links (with their filters) now open the home feed.
function ToHome() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/', search }} replace />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { meta, error } = useMeta();

  return (
    <div className="app">
      <ScrollToTop />
      <Navbar />
      <main className="main">
        {!meta ? (
          <Loading label={error ? 'Connecting to Titik' : 'Loading'} />
        ) : (
          <Routes>
            <Route path="/" element={<ReportsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/reports" element={<ToHome />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
            <Route
              path="/new"
              element={
                <RequireAuth verified role="resident">
                  <NewReportPage />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth role="official">
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rewards"
              element={
                <RequireAuth>
                  <RewardsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route path="/users/:id" element={<ProfilePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route
              path="/profile/security"
              element={
                <RequireAuth>
                  <SecurityPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profile/support"
              element={
                <RequireAuth>
                  <SupportPage />
                </RequireAuth>
              }
            />
            <Route path="/forgot" element={<ForgotPage />} />
            {/* Notifications open from the bell; old links go home. */}
            <Route path="/notifications" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/verify"
              element={
                <RequireAuth>
                  <VerifyPage />
                </RequireAuth>
              }
            />
            <Route
              path="*"
              element={
                <div className="page narrow">
                  <Empty icon={Compass} title="Page not found" action={<Link to="/" className="btn">Back to home</Link>}>
                    That link does not go anywhere.
                  </Empty>
                </div>
              }
            />
          </Routes>
        )}
      </main>
    </div>
  );
}
