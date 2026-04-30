import { Clock, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function PendingAccessView() {
  const { user } = useAuth();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-[#f5f4ed] border border-[#f0eee6] flex items-center justify-center text-[#c96442]">
            <Clock size={36} />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-[500] text-[#141413] uppercase tracking-tight font-serif">
            Account Registered
          </h1>
          <div className="h-1 w-16 bg-[#c96442] rounded-full mx-auto" />
          <p className="text-[#87867f] text-sm leading-relaxed">
            Your account has been created successfully. An administrator will
            assign your role before you can access the system.
          </p>
        </div>

        {user?.email && (
          <div className="bg-[#f5f4ed] border border-[#f0eee6] rounded-[12px] px-6 py-4 flex items-center gap-3">
            <Mail size={16} className="text-[#87867f] shrink-0" />
            <span className="text-sm text-[#4d4c48] font-medium">{user.email}</span>
          </div>
        )}

        <p className="text-[10px] text-[#b0aea5] uppercase tracking-widest">
          CSIR-AMPRI — Contact your system administrator for access
        </p>
      </div>
    </div>
  );
}
