import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useSession, usernameOf } from './auth';
import { StoreProvider, useStore } from './store';
import { ListPage } from './ListPage';
import { HelpPage } from './HelpPage';
import { CalendarPage } from './CalendarPage';
import { Bare, LoginPage, Onboarding, ResetPasswordPage, SettingsPage } from './AccountPages';

// log in as test / test to test onboarding; nothing it does is ever saved
const DEMO_USERNAME = 'test';

function SignedIn() {
  const session = useSession();
  if (session === undefined) return <Bare />;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <StoreProvider key={session.user.id} userId={session.user.id} demo={usernameOf(session) === DEMO_USERNAME}>
      <Outlet />
    </StoreProvider>
  );
}

function SignedOut({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <Bare />;
  if (session) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

/** both views need a first term: until then, onboarding */
function Home({ calendar }: { calendar?: boolean }) {
  const { state, ready } = useStore();
  if (!ready) return <Bare />;
  if (state.quarters.length === 0) return <Onboarding />;
  return calendar ? <CalendarPage /> : <ListPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<SignedOut><LoginPage /></SignedOut>} />
          <Route element={<SignedIn />}>
            <Route path="/home" element={<Home />} />
            <Route path="/calendar" element={<Home calendar />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/password" element={<ResetPasswordPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
