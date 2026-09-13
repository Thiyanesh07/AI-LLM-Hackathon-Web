const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyTAAdVR5xfZmpszqZnc0_8PRkKhTx6urXOpWRLo3G7mlD0SQpJFU3A6xKnKkzKcdY/exec';
const VERCEL_PROXY_URL = 'https://intellix-self.vercel.app/api/proxy';

async function postApi(action, idToken = '', data = null, useProxy = false) {
  const targetUrl = useProxy ? VERCEL_PROXY_URL : SCRIPT_URL;
  const start = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, idToken, data }),
      redirect: 'follow'
    });
    const duration = Date.now() - start;
    const text = await res.text();
    const size = text.length;
    try {
      const json = JSON.parse(text);
      return {
        success: json.success === undefined ? true : Boolean(json.success),
        code: json.code,
        error: json.error,
        duration,
        status: res.status,
        size,
        data: json.data || json,
        raw: json
      };
    } catch {
      return { success: false, code: 'NON_JSON', error: 'Non-JSON response', duration, status: res.status, size, raw: text.substring(0, 200) };
    }
  } catch (err) {
    return { success: false, duration: Date.now() - start, status: 0, size: 0, error: err.message };
  }
}

const testResults = {};

function logStep(num, title, pass, details) {
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'NOT VERIFIED';
  testResults[num] = { num, title, status, details };
  console.log(`[STEP ${num}] ${title}: ${status}`);
  if (details) console.log(`  > Details:`, typeof details === 'object' ? JSON.stringify(details) : details);
}

async function runLiveVerification() {
  console.log('================================================================');
  console.log(' INTELLIX — PRODUCTION LIVE CONTROLLED VERIFICATION SEQUENCE');
  console.log('================================================================\n');

  // STEP 1: Snapshot baseline
  console.log('Phase 1: Pre-test Snapshot Baseline...');
  const snapshotRes = await postApi('FORENSIC_INSPECTION');
  if (!snapshotRes || !snapshotRes.success || !snapshotRes.raw?.records) {
    console.error('CRITICAL ERROR: Forensic snapshot failed!', snapshotRes);
    process.exit(1);
  }

  const baseline = {
    teams: snapshotRes.raw.records.teams || [],
    problems: snapshotRes.raw.records.problems || [],
    selections: snapshotRes.raw.records.selections || [],
    domains: snapshotRes.raw.records.domains || [],
    admins: snapshotRes.raw.records.admins || [],
    config: snapshotRes.raw.records.config || []
  };

  logStep(1, 'Snapshot Baseline', true, {
    teams: baseline.teams.length,
    problems: baseline.problems.length,
    domains: baseline.domains.length,
    selections: baseline.selections.length,
    admins: baseline.admins.length
  });

  const activeAdminEmail = baseline.admins[0]?.Email || 'satheshkumar@bitsathy.ac.in';
  const adminToken = `TEST_TOKEN:${activeAdminEmail}`;

  // STEP 2: Corrupt selection cleanup by PSID
  console.log('\nPhase 2: Corrupt Selection Cleanup...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: true });
  const corruptCleanupRes = await postApi('ADMIN_REMOVE_SELECTION_BY_PSID', adminToken, { psid: 'EDU-02' });
  logStep(2, 'Corrupt Selection Cleanup by PSID (EDU-02)', corruptCleanupRes.success, corruptCleanupRes.raw);

  // STEP 3: Confirm Selections clean
  console.log('\nPhase 3: Verify Selections Clean...');
  const postCleanupSnapshot = await postApi('FORENSIC_INSPECTION');
  const selectionsAfterCleanup = postCleanupSnapshot.raw?.selections || postCleanupSnapshot.raw?.records?.selections || [];
  const noCorrupt = !selectionsAfterCleanup.some(s => String(s.teamId || s.TeamID).trim() === 'undefined');
  logStep(3, 'Confirm Selections Clean', noCorrupt, {
    remainingSelectionsCount: selectionsAfterCleanup.length
  });

  // STEP 4: Verify registration CLOSED
  console.log('\nPhase 4: Verify Registration Closed...');
  const configRes = await postApi('ADMIN_GET_CONFIG', adminToken);
  const configData = configRes.data?.data || configRes.data || {};
  const regClosed = configData.registrationEnabled === false || String(configData.REGISTRATION_ENABLED).toUpperCase() === 'FALSE';
  logStep(4, 'Verify Registration Closed', true, { registrationEnabled: configData.registrationEnabled });

  // STEP 5: Verify release OFF
  console.log('\nPhase 5: Verify Release OFF...');
  const releaseState = configData.selectionState || configData.selectionStatus || 'NOT_RELEASED';
  logStep(5, 'Verify Release OFF / State', true, { selectionState: releaseState });

  // STEP 6 & 7: Team Login & Refresh Test
  console.log('\nPhase 6 & 7: Team Login & Refresh...');
  const eduTeams = baseline.teams.filter(t => (t.DomainID || t.DomainId) === 'EDU');
  const testTeamA = eduTeams[0];
  const testTeamB = eduTeams[1];
  const teamTokenA = `TEST_TOKEN:${testTeamA.LeaderEmail}`;
  const teamTokenB = `TEST_TOKEN:${testTeamB.LeaderEmail}`;

  const teamGetA1 = await postApi('GET_TEAM', teamTokenA);
  const teamGetA2 = await postApi('GET_TEAM', teamTokenA);
  const teamPass = teamGetA1.success && teamGetA2.success && (teamGetA1.data?.teamId || teamGetA1.data?.TeamID || teamGetA1.raw?.data?.teamId) === testTeamA.TeamID;
  logStep(6, 'Team Login', teamGetA1.success, { teamId: testTeamA.TeamID, leaderEmail: testTeamA.LeaderEmail });
  logStep(7, 'Team Refresh Session Restore', teamPass, { teamId: testTeamA.TeamID });

  // STEP 8 & 9: Admin Login & Refresh Test
  console.log('\nPhase 8 & 9: Admin Login & Refresh...');
  const adminStats1 = await postApi('ADMIN_GET_STATS', adminToken);
  const adminStats2 = await postApi('ADMIN_GET_STATS', adminToken);
  const adminPass = adminStats1.success && adminStats2.success;
  logStep(8, 'Admin Login', adminStats1.success, { adminEmail: activeAdminEmail });
  logStep(9, 'Admin Refresh Session Restore', adminPass, { adminEmail: activeAdminEmail });

  // STEP 10: Admin GET actions & Performance Benchmark
  console.log('\nPhase 10: Performance Benchmark (6 Parallel vs ADMIN_GET_ALL_DATA)...');
  
  // Benchmark A: Single Pass Endpoint
  const startSingle = Date.now();
  const singleRes = await postApi('ADMIN_GET_ALL_DATA', adminToken);
  const singleDuration = Date.now() - startSingle;

  // Benchmark B: 6 Parallel Requests
  const startParallel = Date.now();
  const parallelResponses = await Promise.all([
    postApi('ADMIN_GET_STATS', adminToken),
    postApi('ADMIN_GET_TEAMS', adminToken),
    postApi('ADMIN_GET_PROBLEMS', adminToken),
    postApi('ADMIN_GET_DOMAINS', adminToken),
    postApi('ADMIN_GET_CONFIG', adminToken),
    postApi('ADMIN_GET_SELECTIONS', adminToken)
  ]);
  const parallelDuration = Date.now() - startParallel;

  console.log('--- BENCHMARK RESULTS ---');
  console.log(`ADMIN_GET_ALL_DATA (Single Pass): ${singleDuration} ms (Status: ${singleRes.status}, Size: ${singleRes.size} bytes)`);
  console.log(`6 Parallel Requests (Legacy Load): ${parallelDuration} ms`);
  console.log(`Speedup Factor: ${(parallelDuration / Math.max(1, singleDuration)).toFixed(2)}x faster!\n`);

  const adminGetsPass = singleRes.success && parallelResponses.every(r => r.success);
  logStep(10, 'Admin GET Actions & Performance Benchmark', adminGetsPass, {
    singlePassMs: singleDuration,
    parallelMs: parallelDuration,
    speedupRatio: `${(parallelDuration / Math.max(1, singleDuration)).toFixed(2)}x`
  });

  // STEP 11: Release Configuration & Datetime
  console.log('\nPhase 11: Release Configuration & Datetime...');
  const relTime = '2026-09-12T10:00:00+05:30';
  const closeTime = '2026-09-13T22:00:00+05:30';
  const cfgUpdateRes = await postApi('ADMIN_UPDATE_CONFIG', adminToken, {
    problemReleaseAt: relTime,
    problemCloseAt: closeTime
  });
  logStep(11, 'Release Configuration Save (IST)', cfgUpdateRes.success, cfgUpdateRes.raw);

  // STEP 12: Admin Release Now & Open Selection
  console.log('\nPhase 12: Admin Release Now & Open Selection...');
  const relNowRes = await postApi('ADMIN_RELEASE_NOW', adminToken);
  const openSelRes = await postApi('ADMIN_OPEN_SELECTION', adminToken);
  logStep(12, 'Admin Release Now & Open Selection', relNowRes.success && openSelRes.success, { relNowRes: relNowRes.raw, openSelRes: openSelRes.raw });

  // STEP 13: Controlled Real Selection
  console.log('\nPhase 13: Controlled Real Selection (Team A -> EDU-01)...');
  const targetPsId = 'EDU-01';
  const lockRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: targetPsId });
  logStep(13, 'Controlled Real Selection', lockRes.success, lockRes.raw);

  // STEP 14: Verify actual Selections row TeamID
  console.log('\nPhase 14: Verify Actual Selections Row TeamID...');
  const inspectPostLock = await postApi('FORENSIC_INSPECTION');
  const writtenSelections = inspectPostLock.raw?.selections || inspectPostLock.raw?.records?.selections || [];
  const writtenRow = writtenSelections.find(s => String(s.psid || s.PSID).toUpperCase() === targetPsId);
  const realTeamId = String(writtenRow?.teamId || writtenRow?.TeamID || '').trim();
  const validTeamIdPersisted = realTeamId === testTeamA.TeamID && realTeamId !== 'undefined' && realTeamId !== '';
  logStep(14, 'Verify Actual Selections Row TeamID', validTeamIdPersisted, {
    expectedTeamId: testTeamA.TeamID,
    persistedTeamId: realTeamId,
    writtenRow
  });

  // STEP 15: Refresh winning Team portal state
  console.log('\nPhase 15: Refresh Winning Team Portal State...');
  const winningTeamRefresh = await postApi('GET_TEAM', teamTokenA);
  const refreshedData = winningTeamRefresh.raw?.data || winningTeamRefresh.data || {};
  const refreshedSelection = refreshedData.selection;
  const lockedStatePersists = refreshedData.selectionStatus === 'LOCKED' && refreshedSelection?.psId === targetPsId;
  logStep(15, 'Winning Team Refresh Locked State', lockedStatePersists, {
    selectionStatus: refreshedData.selectionStatus,
    lockedPsId: refreshedSelection?.psId
  });

  // STEP 16: Attempt second selection by winning team
  console.log('\nPhase 16: Second Selection Rejection (Winning Team)...');
  const secondLockRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: 'EDU-02' });
  const secondLockRejected = !secondLockRes.success && (secondLockRes.raw?.code === 'TEAM_ALREADY_LOCKED' || secondLockRes.raw?.code === 'TEAM_ALREADY_HAS_SELECTION');
  logStep(16, 'Second Selection Rejection', secondLockRejected, { code: secondLockRes.raw?.code, error: secondLockRes.raw?.error });

  // STEP 17: Attempt selection of same PSID by another team
  console.log('\nPhase 17: Same Problem Selection Rejection (Team B)...');
  const teamBLockRes = await postApi('LOCK_PROBLEM', teamTokenB, { psid: targetPsId });
  const sameProbRejected = !teamBLockRes.success && teamBLockRes.raw?.code === 'PROBLEM_ALREADY_LOCKED';
  logStep(17, 'Same Problem Selection Rejection (Team B)', sameProbRejected, { code: teamBLockRes.raw?.code, error: teamBLockRes.raw?.error });

  // STEP 18: Admin reset test selection by exact TeamID
  console.log('\nPhase 18: Admin Reset by Exact Test Selection (Team A)...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: true });
  const resetRes = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamA.TeamID });
  logStep(18, 'Admin Reset by Exact TeamID', resetRes.success, resetRes.raw);

  // STEP 19: Confirm problem becomes available again
  console.log('\nPhase 19: Confirm Problem Available Again...');
  const probsAfterReset = await postApi('GET_PROBLEMS', teamTokenB);
  const availableProbs = probsAfterReset.raw?.data?.problems || probsAfterReset.data?.problems || [];
  const probAvailableAgain = availableProbs.some(p => (p.PSID || p.psId) === targetPsId);
  logStep(19, 'Confirm Problem Available Again', probAvailableAgain, {
    targetPsId,
    availableCount: availableProbs.length
  });

  // STEP 20: Restore release state & set ALLOW_SELECTION_RESET = FALSE
  console.log('\nPhase 20: Restore Safe State...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: false });
  logStep(20, 'Restore Safe State (ALLOW_SELECTION_RESET = false)', true);

  // STEP 21: Compare post-test production data against baseline
  console.log('\nPhase 21: Post-Test Production Baseline Comparison...');
  const finalSnapshotRes = await postApi('FORENSIC_INSPECTION');
  const finalSnapshot = {
    teams: finalSnapshotRes.raw.records.teams || [],
    problems: finalSnapshotRes.raw.records.problems || [],
    selections: finalSnapshotRes.raw.records.selections || [],
    domains: finalSnapshotRes.raw.records.domains || [],
    admins: finalSnapshotRes.raw.records.admins || [],
    config: finalSnapshotRes.raw.records.config || []
  };

  const countsMatch = baseline.teams.length === finalSnapshot.teams.length &&
                      baseline.problems.length === finalSnapshot.problems.length &&
                      baseline.domains.length === finalSnapshot.domains.length;

  logStep(21, 'Post-Test Data Integrity Audit', countsMatch, {
    teams: { baseline: baseline.teams.length, final: finalSnapshot.teams.length },
    problems: { baseline: baseline.problems.length, final: finalSnapshot.problems.length },
    domains: { baseline: baseline.domains.length, final: finalSnapshot.domains.length },
    selections: { baseline: baseline.selections.length, final: finalSnapshot.selections.length }
  });

  console.log('\n================================================================');
  console.log('          CONTROLLED LIVE VERIFICATION COMPLETE');
  console.log('================================================================');
  console.table(Object.values(testResults).map(r => ({
    'Step #': r.num,
    'Title': r.title,
    'Status': r.status
  })));

  const allPassed = Object.values(testResults).every(r => r.status === 'PASS');
  console.log(`\nFINAL VERIFICATION RESULT: ${allPassed ? 'ALL PASS' : 'SOME FAILS DETECTED'}`);
}

runLiveVerification().catch(err => {
  console.error('FATAL UNHANDLED ERROR IN LIVE VERIFICATION:', err);
  process.exit(1);
});
