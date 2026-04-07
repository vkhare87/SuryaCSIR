import { useState } from 'react';
import { Database, UploadCloud, CheckCircle, AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Cards';
import { isProvisioned, supabase } from '../utils/supabaseClient';
import { parseFile, pushToSupabase, type FileType } from '../utils/dataMigration';

export default function DataManagement() {
  const [selectedType, setSelectedType] = useState<FileType>('staff');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  
  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!isProvisioned() || !supabase) {
       addLog("Error: Database not connected. Please check your .env file.");
       return;
    }

    setIsUploading(true);
    addLog(`Reading file: ${file.name}...`);
    
    try {
      const result = await parseFile(file, selectedType);
      if (!result.success) {
        addLog(`Parse error: ${result.error}`);
        setIsUploading(false);
        return;
      }

      addLog(`Parsed ${result.rowCount} rows. Initiating upload to Supabase...`);
      
      const tableMap: Record<FileType, string> = {
        staff: 'staff',
        divisions: 'divisions',
        projects: 'projects',
        projectStaff: 'project_staff',
        phd: 'phd_students',
        equipment: 'equipment'
      };
      
      const tableName = tableMap[selectedType];
      
      const success = await pushToSupabase(supabase, tableName, result.data, addLog);
      
      if (success) {
        addLog("Upload complete.");
      } else {
        addLog("Upload failed during batch insertion.");
      }

    } catch (err: any) {
      addLog(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-[500] text-text font-serif">Database Operations Center</h1>
        <p className="text-text-muted mt-1">Manage bulk data integration and Supabase connectivity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Connection Status Panel */}
        <Card className="md:col-span-1 space-y-4">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-[#c96442]/10 flex items-center justify-center text-[#c96442]">
              <Database size={20} />
            </div>
            <div>
              <h3 className="font-bold text-text">Connectivity</h3>
              <p className="text-xs text-text-muted">Supabase Integration</p>
            </div>
          </div>
          
          {isProvisioned() ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
              <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Database Connected</p>
                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                  Credentials loaded from environment variables or local storage.
                </p>
              </div>
            </div>
          ) : (
             <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Not Connected</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                  Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable uploads.
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Upload Panel */}
        <Card className="md:col-span-2 space-y-6">
           <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 className="font-bold text-text">Bulk Data Migration</h3>
              <p className="text-xs text-text-muted">Import Excel or CSV files</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-text mb-2">Target Table</label>
              <select 
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as FileType)}
                className="w-full bg-surface-hover border border-border text-text text-sm rounded-lg focus:ring-[#3898ec] focus:border-[#3898ec] block p-2.5 outline-none"
              >
                <option value="divisions">Divisions</option>
                <option value="staff">Human Capital (Staff Directory)</option>
                <option value="projects">Research Projects</option>
                <option value="projectStaff">Project Staff</option>
                <option value="phd">PhD Scholars</option>
                <option value="equipment">Facilities / Equipment</option>
              </select>
            </div>

            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:bg-surface-hover/50 transition-colors">
              <input 
                type="file" 
                id="file-upload" 
                className="hidden" 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center">
                <FileSpreadsheet className="w-12 h-12 text-[#c96442] mb-3 opacity-80" />
                <p className="text-sm font-bold text-text mb-1">
                  {file ? file.name : "Click to select data file"}
                </p>
                <p className="text-xs text-text-muted">
                  Supports .xlsx, .xls, and .csv
                </p>
              </label>
            </div>

            <button
               onClick={handleUpload}
               disabled={!file || isUploading || !isProvisioned()}
               className="w-full bg-[#c96442] text-white font-bold rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-[#b5593b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
               {isUploading ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
               {isUploading ? 'Processing Upload...' : 'Push to Database'}
            </button>
          </div>
        </Card>
      </div>

      {/* Execution Logs */}
      {logs.length > 0 && (
        <Card className="bg-[#141413] border-[#30302e] text-[#b0aea5] font-mono text-xs max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#30302e]">
            <span className="text-[#b0aea5] font-bold tracking-wider">MIGRATION LOGS</span>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50 border border-emerald-500" />
            </div>
          </div>
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
