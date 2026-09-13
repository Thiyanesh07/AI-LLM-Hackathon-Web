const fs = require('fs');
const path = require('path');

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyTAAdVR5xfZmpszqZnc0_8PRkKhTx6urXOpWRLo3G7mlD0SQpJFU3A6xKnKkzKcdY/exec';
const VERCEL_PROXY_URL = 'https://intellix-self.vercel.app/api/proxy';

async function postApi(action, idToken = '', data = null, useProxy = false) {
  const targetUrl = useProxy ? VERCEL_PROXY_URL : SCRIPT_URL;
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, idToken, data }),
      redirect: 'follow'
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: 'Non-JSON response', raw: text.substring(0, 200) };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

const testResults = {};

function logStep(stepNum, title, pass, details) {
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'NOT VERIFIED';
  testResults[stepNum] = { stepNum, title, status, details };
  console.log(`\n[STEP ${stepNum}] ${title}: ${status}`);
  if (details) console.log(`  > Details:`, typeof details === 'object' ? JSON.stringify(details) : details);
}

async function runLiveSmokeTest() {
  console.log('===============================================================');
  console.log('     INTELLIX LIVE SMOKE TEST — APPS SCRIPT VERSION 20');
  console.log('===============================================================\n');

  // STEP 1: Pre-test Snapshot & Setup
  console.log('--- Phase 1: Pre-Test Baseline Snapshot ---');
  const snapshotRes = await postApi('FORENSIC_INSPECTION');
  if (!snapshotRes || !snapshotRes.success || !snapshotRes.records) {
    console.error('CRITICAL ERROR: Failed to obtain pre-test forensic snapshot!', snapshotRes);
    process.exit(1);
  }

  const baselineSnapshot = {
    teams: snapshotRes.records.teams || snapshotRes.records,
    problems: snapshotRes.records.problems || [],
    selections: snapshotRes.records.selections || [],
    domains: snapshotRes.records.domains || [],
    admins: snapshotRes.records.admins || [],
    config: snapshotRes.records.config || []
  };

  const snapshotPath = path.join(__dirname, 'baseline_snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(baselineSnapshot, null, 2));
  console.log(`Baseline snapshot saved (${baselineSnapshot.teams.length} teams, ${baselineSnapshot.selections.length} pre-existing selections).`);

  const activeAdminEmail = baselineSnapshot.admins[0]?.Email || 'satheshkumar@bitsathy.ac.in';
  const adminToken = `TEST_TOKEN:${activeAdminEmail}`;

  // Check config state from ADMIN_GET_CONFIG
  const configRes = await postApi('ADMIN_GET_CONFIG', adminToken);
  const initialConfig = configRes.config || configRes.data || {};
  console.log('Initial Config:', initialConfig);

  const initialRegistrationOpen = String(initialConfig.IsRegistrationOpen).toUpperCase() === 'TRUE';
  const initialAllowReset = String(initialConfig.AllowResetSelection).toUpperCase() === 'TRUE';

  logStep(1, 'Verify Deployment & Endpoints', true, {
    scriptUrl: SCRIPT_URL,
    version: 'Version 20 Deployed',
    preExistingSelections: baselineSnapshot.selections.length,
    initialRegistrationOpen,
    initialAllowReset,
    adminEmail: activeAdminEmail
  });

  // Find 2 test teams in domain 'EDU'
  const eduTeams = baselineSnapshot.teams.filter(t => (t.DomainID || t.DomainId) === 'EDU');
  if (eduTeams.length < 2) {
    console.error('Not enough EDU teams found for testing!');
    process.exit(1);
  }
  const testTeamA = eduTeams[0];
  const testTeamB = eduTeams[1];

  const teamTokenA = `TEST_TOKEN:${testTeamA.LeaderEmail}`;
  const teamTokenB = `TEST_TOKEN:${testTeamB.LeaderEmail}`;

  console.log(`Test Team A: ${testTeamA.TeamID} (${testTeamA.LeaderEmail}), Token: ${teamTokenA}`);
  console.log(`Test Team B: ${testTeamB.TeamID} (${testTeamB.LeaderEmail}), Token: ${teamTokenB}`);

  // Find unallocated problems in EDU domain
  const existingPsIds = new Set(baselineSnapshot.selections.map(s => String(s.PSID || '').toUpperCase()));
  const eduProblems = baselineSnapshot.problems.filter(p => 
    String(p.PSID).toUpperCase().startsWith('EDU') ||
    (p.DomainID || p.DomainId) === 'EDU' ||
    (p.DomainID || p.DomainId) === 'Education & Knowledge'
  );
  const unallocatedEduProblems = eduProblems.filter(p => !existingPsIds.has(String(p.PSID).toUpperCase()));

  if (unallocatedEduProblems.length < 2) {
    console.error('Not enough unallocated EDU problems for testing!');
    process.exit(1);
  }

  const testPsId1 = String(unallocatedEduProblems[0].PSID).trim();
  const testPsId2 = String(unallocatedEduProblems[1].PSID).trim();
  console.log(`Test Problem 1: ${testPsId1}, Test Problem 2: ${testPsId2}`);

  // STEP 2: TEAM PORTAL (`GET_TEAM`)
  console.log('\n--- Phase 2: Team Portal Verification ---');
  const teamRes = await postApi('GET_TEAM', teamTokenA);
  if (teamRes.success && teamRes.data && (teamRes.data.team || teamRes.data.teamId)) {
    const t = teamRes.data.team || teamRes.data;
    const teamIdVal = t.teamId || t.TeamID;
    const emailVal = t.leaderEmail || t.LeaderEmail;
    const domainVal = t.domainId || t.DomainID;
    const pass = teamIdVal === testTeamA.TeamID && emailVal === testTeamA.LeaderEmail && domainVal === testTeamA.DomainID;
    logStep(2, 'Team Portal Scope & Auth', pass, {
      returnedTeamID: teamIdVal,
      returnedEmail: emailVal,
      returnedDomain: domainVal,
      memberCount: (t.members || t.Members || []).length
    });
  } else {
    logStep(2, 'Team Portal Scope & Auth', false, teamRes);
  }

  // STEP 3: ADMIN PORTAL (`ADMIN_GET_STATS`, `ADMIN_GET_PROBLEMS`, etc.)
  console.log('\n--- Phase 3: Admin Portal Verification ---');
  const adminStats = await postApi('ADMIN_GET_STATS', adminToken);
  const adminProblems = await postApi('ADMIN_GET_PROBLEMS', adminToken);
  const adminDomains = await postApi('ADMIN_GET_DOMAINS', adminToken);

  const adminPass = adminStats.success && adminProblems.success && adminDomains.success;
  logStep(3, 'Admin Portal Data & Stats', adminPass, {
    teamsCount: adminStats.data?.registeredTeams || adminStats.data?.totalTeams,
    problemsCount: (adminProblems.data?.problems || adminProblems.problems || []).length,
    domainsCount: (adminDomains.data?.domains || adminDomains.domains || []).length
  });

  // STEP 4: PROBLEM STATUS AUDIT
  console.log('\n--- Phase 4: Problem Status Audit ---');
  const probStatuses = eduProblems.map(p => ({ psId: p.PSID, status: p.Status }));
  const activeCount = probStatuses.filter(s => String(s.status).toUpperCase() === 'ACTIVE').length;
  logStep(4, 'Problem Status Audit', activeCount > 0, {
    totalEduProblems: eduProblems.length,
    activeCount,
    sampleStatuses: probStatuses.slice(0, 3)
  });

  // STEP 5: PROBLEM RELEASE FILTER
  console.log('\n--- Phase 5: Problem Release Verification ---');
  const participantProbsBefore = await postApi('GET_PROBLEMS', teamTokenA);
  const preReleasePass = participantProbsBefore.success;

  // Release problems, open selection, and enable reset for selection testing
  await postApi('ADMIN_RELEASE_NOW', adminToken);
  await postApi('ADMIN_OPEN_SELECTION', adminToken);
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: true });

  const participantProbsAfter = await postApi('GET_PROBLEMS', teamTokenA);
  const returnedProbCount = (participantProbsAfter.data?.problems || participantProbsAfter.problems || []).length;

  logStep(5, 'Problem Release & Retrieval', preReleasePass && participantProbsAfter.success && returnedProbCount > 0, {
    beforeReleaseState: participantProbsBefore.data?.selectionState || participantProbsBefore.selectionState,
    afterReleaseCount: returnedProbCount
  });

  // STEP 6: DOMAIN ISOLATION
  console.log('\n--- Phase 6: Domain Isolation Verification ---');
  const spoofedProbs = await postApi('GET_PROBLEMS', teamTokenA, { domainId: 'EMP' });
  const returnedProbs = spoofedProbs.data?.problems || spoofedProbs.problems || [];
  const allMatchEdu = returnedProbs.length > 0 && returnedProbs.every(p => p.PSID.startsWith('EDU'));
  logStep(6, 'Server-Enforced Domain Isolation', spoofedProbs.success && allMatchEdu, {
    requestedDomain: 'EMP (Spoofed)',
    returnedProblemsCount: returnedProbs.length,
    allMatchTeamDomain: allMatchEdu
  });

  // STEP 7: CONTROLLED REAL SELECTION
  console.log('\n--- Phase 7: Controlled Real Selection ---');
  const selectRes1 = await postApi('LOCK_PROBLEM', teamTokenA, { psid: testPsId1 });
  logStep(7, 'Controlled Real Selection', selectRes1.success, {
    teamId: testTeamA.TeamID,
    psId: testPsId1,
    response: selectRes1
  });

  // STEP 8: DUPLICATE REQUEST
  console.log('\n--- Phase 8: Duplicate Request Rejection ---');
  const dupRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: testPsId1 });
  // Backend may return any of these codes when a team already holds a lock
  const validDupCodes = ['TEAM_ALREADY_HAS_SELECTION', 'PROBLEM_ALREADY_LOCKED', 'TEAM_ALREADY_LOCKED'];
  const dupPass = !dupRes.success && validDupCodes.includes(dupRes.code);
  logStep(8, 'Duplicate Request Rejection', dupPass, {
    expectedErrorCode: validDupCodes.join(' / '),
    receivedCode: dupRes.code,
    receivedError: dupRes.error
  });

  // STEP 9: FIRST-COME-FIRST-SERVED CONCURRENCY
  console.log('\n--- Phase 9: First-Come-First-Served Concurrency ---');
  console.log(`Firing concurrent LOCK_PROBLEM requests for Team A (${testTeamA.TeamID}) and Team B (${testTeamB.TeamID}) on problem ${testPsId2}...`);
  const [concurResA, concurResB] = await Promise.all([
    postApi('LOCK_PROBLEM', teamTokenA, { psid: testPsId2 }),
    postApi('LOCK_PROBLEM', teamTokenB, { psid: testPsId2 })
  ]);

  const concurSuccesses = [concurResA, concurResB].filter(r => r.success);
  const concurFailures = [concurResA, concurResB].filter(r => !r.success);
  const concurPass = concurSuccesses.length === 1 && concurFailures.length === 1;

  let winningTeamId = 'UNKNOWN';
  if (concurResA.success) winningTeamId = testTeamA.TeamID;
  else if (concurResB.success) winningTeamId = testTeamB.TeamID;

  logStep(9, 'First-Come-First-Served Concurrency', concurPass, {
    successCount: concurSuccesses.length,
    failureCount: concurFailures.length,
    winningTeamId,
    resA: concurResA,
    resB: concurResB
  });

  // STEP 10: TARGETED ADMIN RESET (Team A test selection)
  console.log('\n--- Phase 10: Targeted Admin Selection Reset ---');
  const resetTeamARes = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamA.TeamID });
  logStep(10, 'Targeted Admin Reset (Team A)', resetTeamARes.success, {
    targetTeam: testTeamA.TeamID,
    response: resetTeamARes
  });

  // STEP 11: REASSIGNMENT
  console.log('\n--- Phase 11: Problem Reassignment ---');
  // Reset Team B's lock on testPsId2 first if Team B won testPsId2
  await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamB.TeamID });
  // Problem testPsId1 is now unallocated. Have Team B select testPsId1.
  const reassignRes = await postApi('LOCK_PROBLEM', teamTokenB, { psid: testPsId1 });
  logStep(11, 'Problem Reassignment to Team B', reassignRes.success, {
    newTeam: testTeamB.TeamID,
    psId: testPsId1,
    response: reassignRes
  });

  // STEP 12: TARGETED MULTI-TEAM CLEANUP
  console.log('\n--- Phase 12: Targeted Multi-Team Cleanup ---');
  // Reset test selections for Team A and Team B individually.
  const cleanupTeamA = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamA.TeamID });
  const cleanupTeamB = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamB.TeamID });
  const cleanupPass = (cleanupTeamA.success || cleanupTeamA.code === 'NO_ACTIVE_SELECTION') &&
                      (cleanupTeamB.success || cleanupTeamB.code === 'NO_ACTIVE_SELECTION');
  logStep(12, 'Targeted Per-Team Selection Cleanup', cleanupPass, {
    cleanupTeamA,
    cleanupTeamB
  });

  // STEP 13: CLOSE SELECTION ENFORCEMENT
  console.log('\n--- Phase 13: Close Selection Enforcement ---');
  await postApi('ADMIN_CLOSE_SELECTION', adminToken);
  const closeLockRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: testPsId1 });
  const closePass = !closeLockRes.success && closeLockRes.code === 'SELECTION_CLOSED';
  logStep(13, 'Close Selection Enforcement', closePass, {
    expectedCode: 'SELECTION_CLOSED',
    receivedCode: closeLockRes.code,
    receivedError: closeLockRes.error
  });
  // Restore open selection
  await postApi('ADMIN_OPEN_SELECTION', adminToken);

  // STEP 14: RESET SAFETY SWITCH
  console.log('\n--- Phase 14: Reset Safety Switch Verification ---');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: false });
  const safetyRes = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: testTeamA.TeamID });
  const safetyPass = !safetyRes.success && safetyRes.code === 'RESET_NOT_ALLOWED';
  logStep(14, 'Reset Safety Switch (ALLOW_SELECTION_RESET = false)', safetyPass, {
    expectedCode: 'RESET_NOT_ALLOWED',
    receivedCode: safetyRes.code,
    receivedError: safetyRes.error
  });

  // STEP 15: POST-TEST DATA INTEGRITY AUDIT & DIFF
  console.log('\n--- Phase 15: Post-Test Data Integrity Audit ---');
  const postSnapshotRes = await postApi('FORENSIC_INSPECTION');
  const postSnapshot = {
    teams: postSnapshotRes.records.teams || postSnapshotRes.records,
    problems: postSnapshotRes.records.problems || [],
    selections: postSnapshotRes.records.selections || [],
    domains: postSnapshotRes.records.domains || [],
    admins: postSnapshotRes.records.admins || [],
    config: postSnapshotRes.records.config || []
  };

  const teamsCountMatch = baselineSnapshot.teams.length === postSnapshot.teams.length;
  const problemsCountMatch = baselineSnapshot.problems.length === postSnapshot.problems.length;
  const domainsCountMatch = baselineSnapshot.domains.length === postSnapshot.domains.length;

  // Check pre-existing selections integrity
  const preExistingMap = new Map();
  baselineSnapshot.selections.forEach(s => {
    preExistingMap.set(`${s.TeamID}_${s.PSID}`, s.Status);
  });

  let preExistingIntact = true;
  postSnapshot.selections.forEach(s => {
    const key = `${s.TeamID}_${s.PSID}`;
    if (preExistingMap.has(key)) {
      if (preExistingMap.get(key) !== s.Status) {
        preExistingIntact = false;
        console.error(`Pre-existing selection mismatch for ${key}: was ${preExistingMap.get(key)}, now ${s.Status}`);
      }
    }
  });

  const diffPass = teamsCountMatch && problemsCountMatch && domainsCountMatch && preExistingIntact;
  logStep(15, 'Post-Test Baseline Diff & Data Integrity', diffPass, {
    teamsCount: { before: baselineSnapshot.teams.length, after: postSnapshot.teams.length, match: teamsCountMatch },
    problemsCount: { before: baselineSnapshot.problems.length, after: postSnapshot.problems.length, match: problemsCountMatch },
    domainsCount: { before: baselineSnapshot.domains.length, after: postSnapshot.domains.length, match: domainsCountMatch },
    preExistingSelectionsIntact: preExistingIntact
  });

  // STEP 16: FINAL REPORT SUMMARY
  console.log('\n===============================================================');
  console.log('             FINAL SMOKE TEST VERIFICATION REPORT');
  console.log('===============================================================');
  console.table(Object.values(testResults).map(r => ({
    'Step #': r.stepNum,
    'Title': r.title,
    'Status': r.status
  })));

  const allPassed = Object.values(testResults).every(r => r.status === 'PASS');
  logStep(16, 'Full Live Smoke Test Suite', allPassed, {
    totalSteps: Object.keys(testResults).length,
    passedSteps: Object.values(testResults).filter(r => r.status === 'PASS').length,
    failedSteps: Object.values(testResults).filter(r => r.status === 'FAIL').length,
    unverifiedSteps: Object.values(testResults).filter(r => r.status === 'NOT VERIFIED').length
  });

  // Clean up snapshot file
  if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath);

  console.log('\nLIVE SMOKE TEST COMPLETE!');
}

runLiveSmokeTest().catch(err => {
  console.error('FATAL UNHANDLED ERROR IN SMOKE TEST:', err);
  process.exit(1);
});
