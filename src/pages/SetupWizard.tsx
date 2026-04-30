import React, { useState } from 'react';
import { provisionDatabase } from '../utils/supabaseClient';
import { Card } from '../components/ui/Cards';
import { Button } from '../components/ui/Button';

export default function SetupWizard() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // In a real app we'd try to connect first. Here we assume valid input.
    setTimeout(() => {
      provisionDatabase(url, key);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative overflow-hidden">

      {/* Background decorations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c96442]/5 rounded-full blur-3xl" />

      <Card className="w-full max-w-lg p-8 z-10 mx-4 border-[#f0eee6] dark:border-[#30302e]">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-[#f0eee6] text-[#c96442] rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div>
            <h2 className="text-xl font-[500] text-text font-serif">System Unprovisioned</h2>
            <p className="text-text-muted text-sm">SURYA Vault Connection Required</p>
          </div>
        </div>

        <div className="bg-surface-hover p-4 rounded-lg mb-6 text-sm border border-border">
          <p className="text-text mb-2">
            The platform requires a connection to the CSIR-AMPRI Cloud Vault (Supabase).
            If you are a Master Administrator, please initialize the registry below.
          </p>
          <p className="text-text-muted italic">
            Note: If left unprovisioned, the app will run in "Local Demo Mode" using the mock
            data for testing purposes only.
          </p>
        </div>

        <form onSubmit={handleProvision} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Project URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-2 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-text text-sm"
              placeholder="https://xyzcompany.supabase.co"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">
              API Key (Anon)
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-4 py-2 bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] focus:ring-2 focus:ring-[#3898ec] focus:border-[#3898ec] outline-none text-text text-sm"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX..."
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                // Skips to local demo mode via auth
                window.location.hash = '/login';
              }}
            >
              Skip (Run Local)
            </Button>
            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
            >
              Initialize Vault
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
