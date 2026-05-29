import { Navigate } from 'react-router-dom';
import { auth } from '../lib/auth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!auth.isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
