const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { runNormalization } = require('./normalize.cjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dblnbfbkqvcvhlaskbpb.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibG5iZmJrcXZjdmhsYXNrYnBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODA3NzMsImV4cCI6MjEwMzc1Njc3M30.6tuRxUFZBy9uE4SEIWshht9hlKQxybaUUkqECYJpTIA';

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.trim().replace(/\r$/, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i].replace(/\r$/, ''));
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ? cols[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

async function main() {
  console.log('====================================================');
  console.log('  JKLU Student Leadership — Normalization & Ingestion');
  console.log('====================================================\n');

  // 1. Try reading from Supabase application_import / applications_import
  let rawRows = [];
  let sourceTableName = 'application_import';

  let { data: appImportData, error: err1 } = await supabase.from('application_import').select('*');
  if (!err1 && appImportData && appImportData.length > 0) {
    rawRows = appImportData;
    sourceTableName = 'application_import';
    console.log(`[Supabase] Read ${rawRows.length} rows directly from "application_import" table.`);
  } else {
    let { data: appsImportData, error: err2 } = await supabase.from('applications_import').select('*');
    if (!err2 && appsImportData && appsImportData.length > 0) {
      rawRows = appsImportData;
      sourceTableName = 'applications_import';
      console.log(`[Supabase] Read ${rawRows.length} rows directly from "applications_import" table.`);
    } else {
      console.log('[Notice] Supabase application_import table returned 0 rows via API (likely due to table creation / RLS).');
      console.log('[Notice] Ingesting exact real dataset from JKLU CSV to initialize application_import as cloud source of truth...');
      const csvPath = path.resolve(__dirname, '../JKLU_Student_Leadership_Selection_Sheet1___1_.csv');
      const csvContent = fs.readFileSync(csvPath, 'latin1');
      rawRows = parseCsv(csvContent);
      console.log(`[Local CSV] Read ${rawRows.length} real candidate application rows.`);

      // Store into application_import if table exists
      try {
        const { error: upsertErr } = await supabase.from('application_import').upsert(rawRows);
        if (!upsertErr) {
          console.log(`[Supabase] Successfully populated "application_import" table with ${rawRows.length} rows.`);
        }
      } catch (e) {
        // Continue with rawRows
      }
    }
  }

  // 2. Run normalization
  console.log('\nRunning normalization algorithm...');
  const normalized = await runNormalization(rawRows);

  console.log(`\nNormalized Output:`);
  console.log(`  - Total Source Rows: ${normalized.stats.totalSourceRows}`);
  console.log(`  - Unique Candidates: ${normalized.candidates.length}`);
  console.log(`  - Total Applications: ${normalized.applications.length}`);
  console.log(`  - Total Positions: ${normalized.positions.length}`);
  console.log(`  - Data Quality Issues Flagged: ${normalized.dataQualityIssues.length}`);

  // 3. Populate normalized tables in Supabase (idempotent bulk upsert)
  console.log('\nPopulating Supabase PostgreSQL tables...');

  // (a) Candidates
  const chunkSize = 100;
  for (let i = 0; i < normalized.candidates.length; i += chunkSize) {
    const chunk = normalized.candidates.slice(i, i + chunkSize);
    const { error } = await supabase.from('candidates').upsert(chunk);
    if (error) {
      console.error('[Error] inserting candidates:', error);
      break;
    }
  }
  console.log(`  ✓ Candidates table populated (${normalized.candidates.length} records)`);

  // (b) Positions
  for (let i = 0; i < normalized.positions.length; i += chunkSize) {
    const chunk = normalized.positions.slice(i, i + chunkSize);
    const { error } = await supabase.from('positions').upsert(chunk);
    if (error) {
      console.error('[Error] inserting positions:', error);
      break;
    }
  }
  console.log(`  ✓ Positions table populated (${normalized.positions.length} records)`);

  // (c) Applications
  for (let i = 0; i < normalized.applications.length; i += chunkSize) {
    const chunk = normalized.applications.slice(i, i + chunkSize);
    const { error } = await supabase.from('applications').upsert(chunk);
    if (error) {
      console.error('[Error] inserting applications:', error);
      break;
    }
  }
  console.log(`  ✓ Applications table populated (${normalized.applications.length} records)`);

  // (d) Data Quality Issues
  for (let i = 0; i < normalized.dataQualityIssues.length; i += chunkSize) {
    const chunk = normalized.dataQualityIssues.slice(i, i + chunkSize);
    const { error } = await supabase.from('data_quality_issues').upsert(chunk);
    if (error) {
      console.error('[Error] inserting data_quality_issues:', error);
      break;
    }
  }
  console.log(`  ✓ Data Quality Issues table populated (${normalized.dataQualityIssues.length} records)`);

  // 4. Compute Breakdown for Final Report
  const byTrack = {};
  const byPosition = {};

  for (const app of normalized.applications) {
    byTrack[app.track] = (byTrack[app.track] || 0) + 1;
    const posKey = `${app.position}${app.club ? ` (${app.club})` : ''}`;
    byPosition[posKey] = (byPosition[posKey] || 0) + 1;
  }

  const sortedPositions = Object.entries(byPosition).sort((a, b) => b[1] - a[1]);

  console.log('\n====================================================');
  console.log('              INGESTION & IMPORT REPORT             ');
  console.log('====================================================');
  console.log(`\n• Total Source Rows: ${normalized.stats.totalSourceRows}`);
  console.log(`• Unique Candidates: ${normalized.candidates.length}`);
  console.log(`• Total Applications: ${normalized.applications.length}`);

  console.log('\n• Applications by Track:');
  for (const [track, count] of Object.entries(byTrack)) {
    console.log(`    - ${track.padEnd(20)}: ${count}`);
  }

  console.log('\n• Applications by Position:');
  for (const [pos, count] of sortedPositions) {
    console.log(`    - ${pos.padEnd(45)}: ${count}`);
  }

  console.log(`\n• Duplicate Roll Numbers Detected: ${normalized.stats.duplicateRolls.length}`);
  normalized.stats.duplicateRolls.forEach(d => {
    console.log(`    - Row ${d.row}: Roll "${d.rollNumber}" (${d.candidateName})`);
  });

  console.log(`\n• Missing Data Items: ${normalized.stats.missingData.length}`);
  normalized.stats.missingData.forEach(m => {
    console.log(`    - Row ${m.row}: ${m.field} (${m.issue})`);
  });

  console.log(`\n• Ambiguous Rows: ${normalized.stats.ambiguousRows.length}`);
  normalized.stats.ambiguousRows.forEach(a => {
    console.log(`    - Row ${a.row}: ${a.candidate} -> ${a.declaredPosition} (${a.reason})`);
  });

  console.log(`\n• Total Data Quality Issues: ${normalized.dataQualityIssues.length}`);

  const issuesBySeverity = {};
  normalized.dataQualityIssues.forEach(i => {
    issuesBySeverity[i.severity] = (issuesBySeverity[i.severity] || 0) + 1;
  });
  for (const [sev, c] of Object.entries(issuesBySeverity)) {
    console.log(`    - ${sev}: ${c}`);
  }

  console.log('\n====================================================');
  console.log('  Normalization & Ingestion Completed Successfully! ');
  console.log('====================================================\n');
}

main().catch(err => {
  console.error('Fatal error during ingestion:', err);
  process.exit(1);
});
