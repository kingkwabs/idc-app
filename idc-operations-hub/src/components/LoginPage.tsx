import { useState } from 'react';
import { Button } from './ui/button';

export function LoginPage({ onSuccess }: { onSuccess: () => void }){
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:5001'}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
      });
      if (!res.ok) throw new Error('Login failed');
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || 'Login failed');
    }
  };

  return (
    <div className="p-8 max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <input className="w-full border rounded px-3 py-2" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
      <input type="password" className="w-full border rounded px-3 py-2" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
      <Button className="w-full" onClick={submit}>Sign in</Button>
    </div>
  );
}

