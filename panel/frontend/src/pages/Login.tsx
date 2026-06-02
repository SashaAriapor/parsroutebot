import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { auth } from '../lib/auth';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate                = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { username, password }, { withCredentials: true });
      auth.setToken(res.data.accessToken);
      navigate('/');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Too many attempts. Please try again in 15 minutes.');
      } else {
        setError('Invalid username or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background-secondary)',
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 360, padding: '2rem' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: 44, height: 44,
              background: 'var(--color-background-tertiary)',
              borderRadius: 'var(--border-radius-lg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.875rem',
            }}
          >
            <i className="ti ti-route" style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }} />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.125rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            Admin Login
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            Sign in to your panel
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div
              className="badge-danger"
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--border-radius-md)',
                fontSize: '0.8125rem',
                background: 'var(--color-background-danger)',
                color: 'var(--color-text-danger)',
              }}
            >
              <i className="ti ti-alert-circle" style={{ marginRight: '0.375rem' }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.25rem', padding: '0.625rem 1rem' }}
          >
            {loading ? (
              <>
                <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite' }} />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
