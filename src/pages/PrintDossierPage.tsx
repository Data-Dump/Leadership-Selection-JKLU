import { useState, useEffect } from 'react';
import { Printer, Search, ExternalLink, ChevronRight, Layers } from 'lucide-react';

interface HierarchyInfo {
  tier: number;
  tierIcon: string;
  tierLabel: string;
  groupKey: string;
  groupLabel: string;
  clubName: string;
  subTier: number;
  orderKey: string;
}

interface PostData {
  track: string;
  trackColor: string;
  position: string;
  club?: string;
  areaOfInterest?: string;
  rawNextPreference?: string;
  nextPreference?: string;
  pastExperience: string;
  whyChooseYou: string;
  hierarchy: HierarchyInfo;
}

interface CandidateEntry {
  index: number;
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  phone: string;
  batch: string;
  programme: string;
  rawCategory: string;
  posts: PostData[];
  primaryHierarchy: HierarchyInfo;
}

interface HierarchyGroup {
  groupKey: string;
  groupLabel: string;
  tierIcon: string;
  count: number;
}

export function PrintDossierPage() {
  const [candidates, setCandidates] = useState<CandidateEntry[]>([]);
  const [hierarchyGroups, setHierarchyGroups] = useState<HierarchyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateEntry | null>(null);

  useEffect(() => {
    fetch('/data/dossier_data.json')
      .then(res => res.json())
      .then(data => {
        if (data.candidates) {
          setCandidates(data.candidates);
          setHierarchyGroups(data.hierarchyGroups || []);
          if (data.candidates.length > 0) setSelectedCandidate(data.candidates[0]);
        } else {
          setCandidates(data);
          if (data.length > 0) setSelectedCandidate(data[0]);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load dossier data:', err);
        setLoading(false);
      });
  }, []);

  const filteredCandidates = candidates.filter(c => {
    const q = search.toLowerCase().trim();
    const matchesSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.rollNumber.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.posts.some(p =>
        p.position.toLowerCase().includes(q) ||
        (p.nextPreference && p.nextPreference.toLowerCase().includes(q)) ||
        p.pastExperience.toLowerCase().includes(q) ||
        p.whyChooseYou.toLowerCase().includes(q) ||
        (p.club && p.club.toLowerCase().includes(q)) ||
        (p.areaOfInterest && p.areaOfInterest.toLowerCase().includes(q))
      );

    const matchesGroup = groupFilter === 'all' || c.primaryHierarchy?.groupKey === groupFilter;
    const matchesBatch = batchFilter === 'all' || (c.batch && c.batch.includes(batchFilter));

    return matchesSearch && matchesGroup && matchesBatch;
  });

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      {/* Top Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-burgundy-700 text-white rounded text-2xs font-bold uppercase tracking-wider">
                Official Hierarchy Order
              </span>
              <span className="text-xs text-stone-500 font-medium">JKLU Leadership Selection 2026-27</span>
            </div>
            <h1 className="text-xl font-bold text-stone-900 mt-1">Candidate Application Dossier</h1>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/student_dossier.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex items-center gap-2"
            >
              <Printer size={15} />
              <span>Open Full Hard-Copy Printable View ({candidates.length} Students)</span>
              <ExternalLink size={13} className="opacity-70" />
            </a>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t border-stone-100">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search candidate name, roll no, keywords..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-8 w-full text-xs"
            />
          </div>

          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="input text-xs w-56"
          >
            <option value="all">All Positions ({candidates.length})</option>
            {hierarchyGroups.map(g => (
              <option key={g.groupKey} value={g.groupKey}>
                {g.tierIcon} {g.groupLabel} ({g.count})
              </option>
            ))}
          </select>

          <select
            value={batchFilter}
            onChange={e => setBatchFilter(e.target.value)}
            className="input text-xs w-36"
          >
            <option value="all">All Batches</option>
            <option value="2024">Batch 2024</option>
            <option value="2025">Batch 2025</option>
            <option value="2026">Batch 2026</option>
          </select>

          <div className="text-xs text-stone-500 ml-auto font-medium">
            Showing <strong className="text-stone-800">{filteredCandidates.length}</strong> of {candidates.length} students
          </div>
        </div>
      </div>

      {/* Main Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left List */}
        <div className="w-80 lg:w-96 border-r border-stone-200 bg-white overflow-y-auto shrink-0 flex flex-col">
          <div className="p-3 bg-stone-50 border-b border-stone-200 text-xs font-semibold text-stone-600 uppercase tracking-wider flex justify-between">
            <span className="flex items-center gap-1.5">
              <Layers size={13} />
              <span>Applicants Index (Hierarchy Order)</span>
            </span>
            <span>{filteredCandidates.length}</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-stone-400">Loading candidate records...</div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-400">No matching candidates found</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredCandidates.map(c => {
                const isSelected = selectedCandidate?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCandidate(c)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start justify-between gap-2 hover:bg-stone-50 ${
                      isSelected ? 'bg-burgundy-50 border-l-4 border-burgundy-700' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-2xs text-stone-400 font-semibold">#{c.index}</span>
                        <span className={`text-sm font-semibold truncate ${isSelected ? 'text-burgundy-900' : 'text-stone-900'}`}>
                          {c.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
                        <span className="font-mono text-2xs">{c.rollNumber}</span>
                        {c.batch && <span>· {c.batch}</span>}
                        {c.programme && <span>· {c.programme}</span>}
                      </div>

                      {/* Primary hierarchy badge */}
                      <div className="mt-1.5 flex items-center gap-1">
                        <span className="text-3xs px-1.5 py-0.5 rounded font-medium bg-stone-100 text-stone-700 border border-stone-200">
                          {c.primaryHierarchy?.tierIcon} {c.primaryHierarchy?.groupLabel}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className={`shrink-0 mt-1 ${isSelected ? 'text-burgundy-700' : 'text-stone-300'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Pane */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-100">
          {selectedCandidate ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Candidate Sheet Preview */}
              <div className="bg-white border border-stone-200 rounded-lg shadow-sm p-6">
                {/* Header */}
                <div className="flex items-start justify-between border-b-2 border-burgundy-700 pb-4 mb-5">
                  <div>
                    <div className="text-2xs font-bold uppercase tracking-wider text-burgundy-700">
                      JK Lakshmipat University · Student Leadership Selection 2026-27
                    </div>
                    <h2 className="text-2xl font-bold text-stone-900 mt-1">{selectedCandidate.name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="font-mono text-xs px-2 py-0.5 bg-red-50 text-burgundy-700 border border-red-200 rounded font-semibold">
                        {selectedCandidate.rollNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-medium">
                        {selectedCandidate.primaryHierarchy?.tierIcon} {selectedCandidate.primaryHierarchy?.groupLabel}
                      </span>
                      {selectedCandidate.programme && (
                        <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-700 rounded font-medium">
                          {selectedCandidate.programme}
                        </span>
                      )}
                      {selectedCandidate.batch && (
                        <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-700 rounded font-medium">
                          {selectedCandidate.batch}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-700 rounded font-medium">
                        {selectedCandidate.posts.length} Applied Post{selectedCandidate.posts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-2xl font-bold text-stone-300">
                      #{String(selectedCandidate.index).padStart(3, '0')}
                    </div>
                    <div className="text-3xs uppercase font-bold text-stone-400">Hierarchy Rank</div>
                  </div>
                </div>

                {/* Contact grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-stone-50 border border-stone-200 rounded mb-6 text-xs">
                  <div>
                    <div className="text-3xs font-bold uppercase text-stone-400">Email Address</div>
                    <div className="font-medium text-stone-800 break-all">{selectedCandidate.email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-3xs font-bold uppercase text-stone-400">Contact Number</div>
                    <div className="font-medium text-stone-800">{selectedCandidate.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-3xs font-bold uppercase text-stone-400">Programme / Batch</div>
                    <div className="font-medium text-stone-800">
                      {selectedCandidate.programme ? selectedCandidate.programme + ' · ' : ''}
                      {selectedCandidate.batch || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-3xs font-bold uppercase text-stone-400">Primary Post Target</div>
                    <div className="font-medium text-stone-800">
                      {selectedCandidate.posts[0]?.position || 'General'}
                    </div>
                  </div>
                </div>

                {/* Posts & Detailed Answers */}
                <div className="space-y-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-2">
                    <span>Applied Positions & Responses ({selectedCandidate.posts.length})</span>
                    <div className="flex-1 h-px bg-stone-200" />
                  </div>

                  {selectedCandidate.posts.map((post, pIdx) => (
                    <div key={pIdx} className="border border-stone-200 rounded-lg overflow-hidden">
                      {/* Post Title Header */}
                      <div className="bg-stone-50 px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-2xs uppercase font-bold px-2 py-0.5 rounded ${
                              post.track === 'Student Council'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : post.track === 'Club Leadership'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}
                          >
                            {post.track}
                          </span>
                          <span className="font-bold text-stone-900 text-sm">
                            Preferred Post #{pIdx + 1}: {post.position}
                          </span>
                        </div>

                        <div className="text-xs text-stone-600 flex items-center gap-2">
                          {post.club && <span className="bg-white border border-stone-200 px-2 py-0.5 rounded font-semibold">Club: {post.club}</span>}
                          {post.areaOfInterest && <span className="bg-white border border-stone-200 px-2 py-0.5 rounded font-semibold">Area of Interest: {post.areaOfInterest}</span>}
                        </div>
                      </div>

                      {/* Prominent Next Preference Banner */}
                      {post.nextPreference && post.nextPreference !== 'None' && (
                        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-emerald-900 font-medium">
                            <span className="text-emerald-700 font-bold">↪ Next Preference:</span>
                            <span className="bg-emerald-100 text-emerald-950 font-bold px-2 py-0.5 rounded border border-emerald-300">
                              {post.nextPreference}
                            </span>
                          </div>
                          <span className="text-2xs text-emerald-700 italic">
                            Past experience & why choose you apply to both Preferred Post & Next Preference
                          </span>
                        </div>
                      )}

                      {/* Post Body */}
                      <div className="p-4 space-y-4">
                        {/* Past Experience */}
                        <div>
                          <div className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span>💼</span>
                              <span>Past Experience & Track Record</span>
                            </div>
                            <span className="text-2xs font-semibold text-stone-400 normal-case">
                              For {post.position}{post.nextPreference && post.nextPreference !== 'None' ? ' & ' + post.nextPreference : ''}
                            </span>
                          </div>
                          <div className="text-xs text-stone-800 leading-relaxed whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-3 font-normal">
                            {post.pastExperience || 'No past experience provided.'}
                          </div>
                        </div>

                        {/* Why Should We Choose You */}
                        <div>
                          <div className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span>🎯</span>
                              <span>Why Should We Choose You?</span>
                            </div>
                            <span className="text-2xs font-semibold text-stone-400 normal-case">
                              For {post.position}{post.nextPreference && post.nextPreference !== 'None' ? ' & ' + post.nextPreference : ''}
                            </span>
                          </div>
                          <div className="text-xs text-amber-950 leading-relaxed whitespace-pre-wrap bg-amber-50/70 border border-amber-200 rounded p-3 font-medium">
                            {post.whyChooseYou || 'No response provided.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Hard copy evaluation rubric preview */}
                <div className="mt-8 border-1.5 border-stone-300 rounded-lg p-4 bg-stone-50/50">
                  <div className="text-xs font-bold uppercase tracking-wider text-burgundy-700 mb-3 flex items-center justify-between">
                    <span>Interview Assessment & Rubric Scoring (For Panelists)</span>
                    <span className="text-2xs font-normal text-stone-500">Candidate #{selectedCandidate.index}</span>
                  </div>

                  <table className="w-full text-xs border border-stone-200 bg-white">
                    <thead className="bg-stone-100 text-stone-700">
                      <tr>
                        <th className="p-2 border text-left">Assessment Parameter</th>
                        <th className="p-2 border text-center w-24">Max Marks</th>
                        <th className="p-2 border text-center w-24">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 text-stone-700">
                      <tr>
                        <td className="p-2 border">1. Vision & Strategic Thinking (Clarity & Council alignment)</td>
                        <td className="p-2 border text-center font-mono">25</td>
                        <td className="p-2 border text-center"><div className="w-10 h-5 border border-stone-300 mx-auto rounded" /></td>
                      </tr>
                      <tr>
                        <td className="p-2 border">2. Relevant Experience & Execution (Demonstrated leadership)</td>
                        <td className="p-2 border text-center font-mono">25</td>
                        <td className="p-2 border text-center"><div className="w-10 h-5 border border-stone-300 mx-auto rounded" /></td>
                      </tr>
                      <tr>
                        <td className="p-2 border">3. Communication & Articulation (Confidence & representation)</td>
                        <td className="p-2 border text-center font-mono">25</td>
                        <td className="p-2 border text-center"><div className="w-10 h-5 border border-stone-300 mx-auto rounded" /></td>
                      </tr>
                      <tr>
                        <td className="p-2 border">4. Problem Solving & Commitment (Collaboration & reliability)</td>
                        <td className="p-2 border text-center font-mono">25</td>
                        <td className="p-2 border text-center"><div className="w-10 h-5 border border-stone-300 mx-auto rounded" /></td>
                      </tr>
                      <tr className="font-bold bg-stone-50">
                        <td className="p-2 border text-right uppercase">Total Score:</td>
                        <td className="p-2 border text-center font-mono">100</td>
                        <td className="p-2 border text-center"><div className="w-10 h-5 border border-stone-300 mx-auto rounded" /></td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 p-2.5 bg-stone-100 rounded text-xs font-medium text-stone-700">
                    <span>Panel Recommendation:</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-stone-500 rounded-sm inline-block" /> Selected</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-stone-500 rounded-sm inline-block" /> Shortlisted</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-stone-500 rounded-sm inline-block" /> Waitlisted</span>
                      <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border border-stone-500 rounded-sm inline-block" /> Rejected</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-400 text-sm">
              Select a candidate from the left index to view their detailed application responses.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
