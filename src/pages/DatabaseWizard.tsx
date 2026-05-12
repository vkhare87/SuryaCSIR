import { Wrench } from 'lucide-react';

export default function DatabaseWizard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Wrench className="w-16 h-16 text-text-muted" />
      <h1 className="text-2xl font-semibold text-text">Database Wizard</h1>
      <p className="text-text-muted max-w-md text-center">
        Database provisioning and management tools will be available here.
      </p>
    </div>
  );
}
