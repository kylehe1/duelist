import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useSession } from './auth';
import { StoreProvider, useStore } from './store';
import { ListPage } from './ListPage';
import { HelpPage } from './HelpPage';
import { Bare, LoginPage, Onboarding, ResetPasswordPage, SettingsPage } from './AccountPages';

function SignedIn() {
  const session = useSession();
  if (session === undefined) return <Bare />;
  if (!session) return <Navigate to="/login" replace />;
  return <StoreProvider key={session.user.id} userId={session.user.id}><Outlet /></StoreProvider>;
}

function SignedOut({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session === undefined) return <Bare />;
  if (session) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function Home() {
  const { state, ready } = useStore();
  if (!ready) return <Bare />;
  return state.quarters.length === 0 ? <Onboarding /> : <ListPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<SignedOut><LoginPage /></SignedOut>} />
          <Route element={<SignedIn />}>
            <Route path="/home" element={<Home />} />
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
