import { useState, useRef } from 'react';
import { db } from '../data/db';
import { parseCSVText } from '../data/csvParser';
import { useAuth } from '../auth/AuthContext';
import { logAudit } from '../data/audit';
import { comparePositions } from '../utils/positionHierarchy';
import { PageHeader } from '../components/shared/SharedComponents';
import { Upload, CheckCircle, AlertTriangle, FileText, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { Position } from '../types';

type ImportStep = 'upload' | 'preview' | 'importing' | 'done' | 'error';

export function ImportDataPage() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseCSVText> | null>(null);
  const [importResult, setImportResult] = useState<{ candidates: number; applications: number; issues: number } | null>(null);
  const [error, setError] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setCsvText(text);
      const parsed = parseCSVText(text);
      setPreview(parsed);
      setStep('preview');
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file, 'latin1');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) handleFile(file);
  }

  async function runImport() {
    if (!preview || !user) return;
    setStep('importing');

    try {
      // Get existing roll numbers to detect duplicates
      const existingCandidates = await db.candidates.toArray();
      const existingRolls = new Set(existingCandidates.map(c => c.rollNumber.toLowerCase()));

      const newCandidates = skipDuplicates
        ? preview.candidates.filter(c => !existingRolls.has(c.rollNumber.toLowerCase()))
        : preview.candidates;

      const newCandidateIds = new Set(newCandidates.map(c => c.id));
      const newApplications = preview.applications.filter(a => newCandidateIds.has(a.candidateId));

      await db.candidates.bulkAdd(newCandidates);
      await db.applications.bulkAdd(newApplications);
      await db.dataQualityIssues.bulkAdd(preview.dataQualityIssues);

      // Auto-create missing positions
      const existingPositions = await db.positions.toArray();
      const existingPosKeys = new Set(existingPositions.map(p => `${p.track}::${p.nameNormalized}${p.club ? `::${p.club.toLowerCase()}` : ''}`));
      const defaultRubric = await db.rubrics.get('rubric-default-1');

      const positionMap = new Map<string, { name: string; track: string; club?: string }>();
      for (const app of newApplications) {
        const key = `${app.track}::${app.positionNormalized}${app.club ? `::${app.club.toLowerCase()}` : ''}`;
        if (!existingPosKeys.has(key) && !positionMap.has(key)) {
          positionMap.set(key, { name: app.position, track: app.track, club: app.club });
        }
      }

      const now = Date.now();
      const newPositions: Position[] = Array.from(positionMap.values()).map(val => ({
        id: uuidv4(),
        name: val.name,
        nameNormalized: val.name.toLowerCase().replace(/[\s\-–—]+/g, ' '),
        track: val.track as Position['track'],
        club: val.club,
        rubricId: defaultRubric?.id,
        createdAt: now,
        updatedAt: now,
      })).sort((a, b) => comparePositions(
        { name: a.name, club: a.club, track: a.track },
        { name: b.name, club: b.club, track: b.track }
      ));
      if (newPositions.length > 0) await db.positions.bulkAdd(newPositions);

      await logAudit(user.id, user.name, 'imported', {
        details: `Imported ${newCandidates.length} candidates and ${newApplications.length} applications from ${fileName}.`,
      });

      setImportResult({ candidates: newCandidates.length, applications: newApplications.length, issues: preview.dataQualityIssues.length });
      setStep('done');
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setStep('error');
    }
  }

  return (
    <div>
      <PageHeader title="Import Data" subtitle="Import candidate applications from CSV" />
      <div className="p-6 max-w-2xl">

        {step === 'upload' && (
          <div
            className="card p-8 text-center border-dashed border-2 border-stone-300 hover:border-navy-400 cursor-pointer transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="mx-auto text-stone-300 mb-3" />
            <div className="font-medium text-stone-700 mb-1">Drop CSV file here or click to select</div>
            <div className="text-sm text-stone-400">Accepts the JKLU Leadership Selection CSV format</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-stone-400" />
                <span className="font-medium text-stone-800">{fileName}</span>
                <button className="ml-auto btn btn-ghost btn-sm" onClick={() => { setStep('upload'); setPreview(null); }}>
                  <X size={12} /> Change file
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-stone-50 rounded p-3">
                  <div className="text-xl font-mono font-semibold text-stone-800">{preview.stats.candidatesCreated}</div>
                  <div className="text-xs text-stone-400">Candidates</div>
                </div>
                <div className="bg-stone-50 rounded p-3">
                  <div className="text-xl font-mono font-semibold text-stone-800">{preview.stats.applicationsCreated}</div>
                  <div className="text-xs text-stone-400">Applications</div>
                </div>
                <div className="bg-amber-50 rounded p-3">
                  <div className="text-xl font-mono font-semibold text-amber-700">{preview.stats.issuesFound}</div>
                  <div className="text-xs text-amber-600">Issues Found</div>
                </div>
              </div>
            </div>

            {preview.dataQualityIssues.length > 0 && (
              <div className="card p-4">
                <div className="section-header">Data Quality Issues Preview</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {preview.dataQualityIssues.slice(0, 10).map(issue => (
                    <div key={issue.id} className="flex items-start gap-2 text-xs">
                      <AlertTriangle size={11} className={`shrink-0 mt-0.5 ${issue.severity === 'Critical' ? 'text-red-500' : 'text-amber-500'}`} />
                      <span className="text-stone-600">{issue.description}</span>
                    </div>
                  ))}
                  {preview.dataQualityIssues.length > 10 && (
                    <div className="text-xs text-stone-400">…and {preview.dataQualityIssues.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            <div className="card p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)}
                  className="accent-navy-700"
                />
                Skip candidates with duplicate roll numbers (recommended)
              </label>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => { setStep('upload'); setPreview(null); }}>Cancel</button>
                <button className="btn btn-primary" onClick={runImport}>
                  Import {preview.stats.candidatesCreated} Candidates
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="card p-8 text-center">
            <div className="w-8 h-8 border-2 border-navy-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <div className="text-stone-600">Importing candidates and applications…</div>
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="card p-6 text-center space-y-3">
            <CheckCircle size={32} className="mx-auto text-green-500" />
            <div className="font-semibold text-stone-800">Import Complete</div>
            <div className="text-sm text-stone-500">
              {importResult.candidates} candidates and {importResult.applications} applications imported.
              {importResult.issues > 0 && ` ${importResult.issues} data quality issues recorded.`}
            </div>
            <button className="btn btn-primary" onClick={() => { setStep('upload'); setPreview(null); setImportResult(null); }}>
              Import Another File
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="card p-6 text-center space-y-3">
            <AlertTriangle size={32} className="mx-auto text-red-500" />
            <div className="font-semibold text-stone-800">Import Failed</div>
            <div className="text-sm text-red-600">{error}</div>
            <button className="btn btn-secondary" onClick={() => { setStep('upload'); setError(''); }}>Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
