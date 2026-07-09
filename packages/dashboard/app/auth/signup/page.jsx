'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { Eye, EyeOff, UserPlus } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess('Verification email sent. Check your inbox.');
    setTimeout(() => router.push('/auth/login'), 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-l0 canvas-grid text-on-surface px-4">
      <div className="bg-surface-l1/80 backdrop-blur-md border border-outline-variant/40 p-8 rounded-xl shadow-2xl w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-3">
            <UserPlus className="w-6 h-6 text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Create an account</h1>
          <p className="text-xs text-on-surface-variant/60 mt-1">Monitor codebase changes in real-time</p>
        </div>
        
        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="bg-critical/10 border border-critical/30 text-critical px-4 py-2.5 rounded-lg text-xs leading-normal">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-stable/10 border border-stable/30 text-stable px-4 py-2.5 rounded-lg text-xs leading-normal">
              {success}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-on-surface-variant">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-surface-l2 border border-outline-variant/45 rounded-lg text-on-surface text-sm placeholder:text-on-surface-variant/30 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-all font-mono"
              placeholder="name@domain.com"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-on-surface-variant">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-10 py-2 bg-surface-l2 border border-outline-variant/45 rounded-lg text-on-surface text-sm placeholder:text-on-surface-variant/30 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-all font-mono"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 hover:text-on-surface transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-on-surface-variant">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-surface-l2 border border-outline-variant/45 rounded-lg text-on-surface text-sm placeholder:text-on-surface-variant/30 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-all font-mono"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-primary text-surface-l0 py-2 rounded-lg font-semibold hover:bg-white disabled:opacity-50 transition-all shadow-[0_0_12px_rgba(200,198,197,0.1)] hover:shadow-[0_0_16px_rgba(200,198,197,0.25)] text-sm mt-2"
          >
            {loading ? 'Registering...' : 'Get Started'}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-on-surface-variant">
          Already have an account?{' '}
          <a href="/auth/login" className="text-accent-primary hover:underline font-semibold transition-colors">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
