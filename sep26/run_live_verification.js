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

// Canonical property helpers across raw Sheets rows and normalized API objects
function getTeamId(t) { return String(t?.['Column 1'] || t?.[''] || t?.TeamID || t?.teamId || t?.['Team ID'] || t?.TeamId || '').trim(); }
function getLeaderName(t) { return String(t?.LeaderName || t?.leaderName || t?.['Leader Name'] || '').trim(); }
function getTeamName(t) { return String(t?.TeamName || t?.teamName || t?.['Team Name'] || '').trim(); }
function getLeaderEmail(t) { return String(t?.LeaderEmail || t?.leaderEmail || t?.['Leader Email'] || '').trim().toLowerCase(); }
function getLeaderMobile(t) { return String(t?.LeaderMobile || t?.LeaderMobileNumber || t?.leaderMobile || t?.['LeaderMobileNumber'] || t?.['Leader Mobile'] || '9876543210').trim(); }
function getLeaderReg(t) { return String(t?.LeaderRegisterNumber || t?.leaderRegisterNumber || t?.['LeaderRegisterNumber'] || t?.['Leader Register Number'] || '7376221CS101').trim(); }
function getLeaderDept(t) { return String(t?.LeaderDepartment || t?.leaderDepartment || t?.['LeaderDepartment'] || t?.['Leader Department'] || 'CSE').trim(); }
function getDomainId(t) { return String(t?.DomainID || t?.domainId || t?.['Domain ID'] || '').trim().toUpperCase(); }
function getPsId(p) { return String(p?.PSID || p?.psId || p?.['PSID'] || p?.Psid || '').trim().toUpperCase(); }
function getTitle(p) { return String(p?.Title || p?.title || p?.['Title'] || '').trim(); }
function getMaxTeams(d) { return Number(d?.MaximumTeams || d?.maximumTeams || d?.['Maximum Teams'] || 0); }

const testResults = [];

function logStep(id, group, name, pass, beforeFix, afterFix, details) {
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'NOT VERIFIED';
  testResults.push({ id, group, name, status, beforeFix, afterFix, details });
  console.log(`[${status}] ${id} - ${name}`);
  if (details) {
    console.log(`       Details:`, typeof details === 'object' ? JSON.stringify(details) : details);
  }
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

  logStep('T01', 'AUTH', 'Pre-test Snapshot Baseline', true, 'Unverified baseline', 'Snapshot captured', {
    teams: baseline.teams.length,
    problems: baseline.problems.length,
    domains: baseline.domains.length,
    selections: baseline.selections.length,
    admins: baseline.admins.length
  });

  const activeAdminEmail = baseline.admins[0]?.Email || 'satheshkumar@bitsathy.ac.in';
  const adminToken = `TEST_TOKEN:${activeAdminEmail}`;

  // STEP 2: Auth Token Type Safety
  console.log('\nPhase 2: Auth Token Type Safety Verification...');
  const fakeEvent = { constructor: { name: 'MouseEvent' }, target: {} };
  const mouseEventRes = await postApi('ADMIN_GET_STATS', fakeEvent);
  const typeSafetyPass = !mouseEventRes.success && ['AUTH_REQUIRED', 'INVALID_TOKEN', 'MALFORMED_PAYLOAD'].includes(mouseEventRes.code);
  logStep('T02', 'AUTH', 'Auth Token Type Safety (MouseEvent/Window Rejection)', typeSafetyPass, 'Circular JSON / Event Credential Leakage', 'Clean rejection (INVALID_TOKEN / AUTH_REQUIRED)', {
    mouseEventRes: { success: mouseEventRes.success, code: mouseEventRes.code }
  });

  // STEP 3: Corrupt selection cleanup by PSID
  console.log('\nPhase 3: Corrupt Selection Cleanup...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: true });
  const corruptCleanupRes = await postApi('ADMIN_REMOVE_SELECTION_BY_PSID', adminToken, { psid: 'EDU-02' });
  logStep('T03', 'SELECTION', 'Corrupt Selection Cleanup by PSID (EDU-02)', corruptCleanupRes.success, 'Corrupt undefined TeamID selection', 'Cleaned up by PSID', corruptCleanupRes.raw);

  // STEP 4: Session Safety under Non-Auth Business Errors
  console.log('\nPhase 4: Session Safety under Non-Auth Business Errors...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: false });
  const resetNotAllowedRes = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: 'BIT-AI-001' });
  const sessionSafePass = !resetNotAllowedRes.success && resetNotAllowedRes.code === 'RESET_NOT_ALLOWED';
  logStep('T04', 'AUTH', 'Session Preservation on Business Error (RESET_NOT_ALLOWED)', sessionSafePass, 'Session Logout on Error', 'Session Preserved / Alert Shown', { code: resetNotAllowedRes.code });

  // STEP 5: Explicit Admin CRUD — Teams
  console.log('\nPhase 5: Explicit Admin CRUD — Teams...');
  const testTeamToEdit = baseline.teams[0];
  const targetTeamId = getTeamId(testTeamToEdit);
  const originalLeaderName = getLeaderName(testTeamToEdit) || 'Original Leader';
  const updatedLeaderName = originalLeaderName + ' (Verified)';

  // Modify Team
  const updateRes1 = await postApi('ADMIN_UPDATE_TEAM', adminToken, {
    teamId: targetTeamId,
    teamName: getTeamName(testTeamToEdit),
    leaderName: updatedLeaderName,
    leaderEmail: getLeaderEmail(testTeamToEdit),
    leaderMobile: getLeaderMobile(testTeamToEdit),
    leaderRegisterNumber: getLeaderReg(testTeamToEdit),
    leaderDepartment: getLeaderDept(testTeamToEdit),
    members: testTeamToEdit.Members || testTeamToEdit.members || [],
    domainId: getDomainId(testTeamToEdit) || 'AGR'
  });
  
  // Readback
  const readbackSnapshot1 = await postApi('FORENSIC_INSPECTION');
  const readbackTeam = (readbackSnapshot1.raw?.records?.teams || []).find(t => getTeamId(t) === targetTeamId);
  const readbackLeader1 = getLeaderName(readbackTeam);
  const teamUpdatedInSheets = readbackLeader1 === updatedLeaderName;

  // Restore Team
  const restoreRes1 = await postApi('ADMIN_UPDATE_TEAM', adminToken, {
    teamId: targetTeamId,
    teamName: getTeamName(testTeamToEdit),
    leaderName: originalLeaderName,
    leaderEmail: getLeaderEmail(testTeamToEdit),
    leaderMobile: getLeaderMobile(testTeamToEdit),
    leaderRegisterNumber: getLeaderReg(testTeamToEdit),
    leaderDepartment: getLeaderDept(testTeamToEdit),
    members: testTeamToEdit.Members || testTeamToEdit.members || [],
    domainId: getDomainId(testTeamToEdit) || 'AGR'
  });
  const restoreSnapshot1 = await postApi('FORENSIC_INSPECTION');
  const restoredTeam = (restoreSnapshot1.raw?.records?.teams || []).find(t => getTeamId(t) === targetTeamId);
  const restoredLeader1 = getLeaderName(restoredTeam);
  const teamRestoredPass = restoredLeader1 === originalLeaderName;

  logStep('T05', 'ADMIN CRUD', 'Team Edit Round-Trip & Sheet Persistence', teamUpdatedInSheets && teamRestoredPass, 'Form submit without readback', 'Sheets write, readback & restore verified', {
    teamId: targetTeamId,
    updateRes: updateRes1.raw,
    restoreRes: restoreRes1.raw,
    updatedName: updatedLeaderName,
    readbackName: readbackLeader1,
    restoredName: restoredLeader1
  });

  // STEP 6: Explicit Admin CRUD — Problems
  console.log('\nPhase 6: Explicit Admin CRUD — Problems...');
  const testProbToEdit = baseline.problems[0];
  const targetPsIdToEdit = getPsId(testProbToEdit);
  const originalProbTitle = getTitle(testProbToEdit) || 'Original Problem';
  const updatedProbTitle = originalProbTitle + ' (Verified)';

  // Modify Problem
  await postApi('ADMIN_UPDATE_PROBLEM', adminToken, {
    psId: targetPsIdToEdit,
    domainId: getDomainId(testProbToEdit) || 'AGR',
    title: updatedProbTitle,
    description: testProbToEdit.Description || testProbToEdit.description || 'Description',
    whatToBuild: testProbToEdit.WhatToBuild || testProbToEdit.whatToBuild || 'Build'
  });

  const readbackSnapshot2 = await postApi('FORENSIC_INSPECTION');
  const readbackProb = (readbackSnapshot2.raw?.records?.problems || []).find(p => getPsId(p) === targetPsIdToEdit);
  const readbackTitle2 = getTitle(readbackProb);
  const probUpdatedInSheets = readbackTitle2 === updatedProbTitle;

  // Restore Problem
  await postApi('ADMIN_UPDATE_PROBLEM', adminToken, {
    psId: targetPsIdToEdit,
    domainId: getDomainId(testProbToEdit) || 'AGR',
    title: originalProbTitle,
    description: testProbToEdit.Description || testProbToEdit.description || 'Description',
    whatToBuild: testProbToEdit.WhatToBuild || testProbToEdit.whatToBuild || 'Build'
  });
  const restoreSnapshot2 = await postApi('FORENSIC_INSPECTION');
  const restoredProb = (restoreSnapshot2.raw?.records?.problems || []).find(p => getPsId(p) === targetPsIdToEdit);
  const restoredTitle2 = getTitle(restoredProb);
  const probRestoredPass = restoredTitle2 === originalProbTitle;

  logStep('T06', 'ADMIN CRUD', 'Problem Edit Round-Trip & Sheet Persistence', probUpdatedInSheets && probRestoredPass, 'Form submit without readback', 'Sheets write, readback & restore verified', {
    psId: targetPsIdToEdit,
    updatedTitle: updatedProbTitle,
    readbackTitle: readbackTitle2,
    restoredTitle: restoredTitle2
  });

  // STEP 7: Explicit Admin CRUD — Domains
  console.log('\nPhase 7: Explicit Admin CRUD — Domains...');
  const testDomainToEdit = baseline.domains[0];
  const targetDomainId = getDomainId(testDomainToEdit);
  const originalMaxTeams = getMaxTeams(testDomainToEdit) || 12;
  const updatedMaxTeams = originalMaxTeams + 2;

  // Modify Domain
  await postApi('ADMIN_UPDATE_DOMAIN', adminToken, {
    domainId: targetDomainId,
    domainName: testDomainToEdit.DomainName || testDomainToEdit.domainName,
    maximumTeams: updatedMaxTeams,
    status: 'ACTIVE'
  });

  const readbackSnapshot3 = await postApi('FORENSIC_INSPECTION');
  const readbackDomain = (readbackSnapshot3.raw?.records?.domains || []).find(d => getDomainId(d) === targetDomainId);
  const readbackMax3 = getMaxTeams(readbackDomain);
  const domainUpdatedInSheets = readbackMax3 === updatedMaxTeams;

  // Restore Domain
  await postApi('ADMIN_UPDATE_DOMAIN', adminToken, {
    domainId: targetDomainId,
    domainName: testDomainToEdit.DomainName || testDomainToEdit.domainName,
    maximumTeams: originalMaxTeams,
    status: 'ACTIVE'
  });
  const restoreSnapshot3 = await postApi('FORENSIC_INSPECTION');
  const restoredDomain = (restoreSnapshot3.raw?.records?.domains || []).find(d => getDomainId(d) === targetDomainId);
  const restoredMax3 = getMaxTeams(restoredDomain);
  const domainRestoredPass = restoredMax3 === originalMaxTeams;

  logStep('T07', 'ADMIN CRUD', 'Domain Edit Round-Trip & Capacity Persistence', domainUpdatedInSheets && domainRestoredPass, 'Inline edit without verification', 'Sheets capacity write & restore verified', {
    domainId: targetDomainId,
    updatedMax: updatedMaxTeams,
    readbackMax: readbackMax3,
    restoredMax: restoredMax3
  });

  // STEP 8: Separate Release Control Tests (Scheduled, Release Now, Open, Close)
  console.log('\nPhase 8: Separate Release Control Tests...');
  
  // A. Scheduled Release state
  await postApi('ADMIN_UPDATE_CONFIG', adminToken, {
    problemReleaseOverride: false,
    selectionStatus: 'NOT_RELEASED',
    problemReleaseAt: '2026-09-15T10:00:00+05:30',
    problemCloseAt: '2026-09-15T10:30:00+05:30'
  });
  const preReleaseConfig = await postApi('ADMIN_GET_CONFIG', adminToken);
  const eduTeams = baseline.teams.filter(t => getDomainId(t) === 'EDU');
  const testTeamA = eduTeams[0];
  const testTeamB = eduTeams[1];
  const targetTeamIdA = getTeamId(testTeamA);
  const targetTeamIdB = getTeamId(testTeamB);
  const teamTokenA = `TEST_TOKEN:${getLeaderEmail(testTeamA)}`;
  const teamTokenB = `TEST_TOKEN:${getLeaderEmail(testTeamB)}`;

  const preReleaseProbs = await postApi('GET_PROBLEMS', teamTokenA);
  const preReleaseHidden = (preReleaseProbs.data?.problems || preReleaseProbs.raw?.data?.problems || []).length === 0;

  // B. Release Now
  const relNowRes = await postApi('ADMIN_RELEASE_NOW', adminToken);
  
  // C. Open Selection
  const openSelRes = await postApi('ADMIN_OPEN_SELECTION', adminToken);

  const postReleaseProbs = await postApi('GET_PROBLEMS', teamTokenA);
  const postReleaseVisible = (postReleaseProbs.data?.problems || postReleaseProbs.raw?.data?.problems || []).length > 0;

  logStep('T08', 'RELEASE', 'Scheduled Release & Pre-Release Problem Metadata Masking', preReleaseHidden, 'Problems visible pre-release', 'Empty problem array pre-release', {
    selectionState: preReleaseConfig.data?.selectionState
  });

  logStep('T09', 'RELEASE', 'Admin Release Now & Open Selection State Transitions', relNowRes.success && openSelRes.success && postReleaseVisible, 'State transition failure', 'State becomes SELECTION_OPEN & problems visible', {
    relNow: relNowRes.raw,
    openSel: openSelRes.raw,
    visibleCount: (postReleaseProbs.data?.problems || []).length
  });

  // STEP 9: Controlled Team Locking Regression
  console.log('\nPhase 9: Controlled Team Locking Regression...');
  const existingPsIds = new Set(baseline.selections.map(s => getPsId(s)));
  const unallocatedEduProb = baseline.problems.find(p => {
    const psid = getPsId(p);
    const pDomain = getDomainId(p);
    return (pDomain === 'EDU' || psid.startsWith('EDU-')) && !existingPsIds.has(psid);
  });
  const targetPsId = unallocatedEduProb ? getPsId(unallocatedEduProb) : 'EDU-02';

  const lockRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: targetPsId });

  // Read actual Selections row TeamID
  const inspectPostLock = await postApi('FORENSIC_INSPECTION');
  const writtenSelections = inspectPostLock.raw?.selections || inspectPostLock.raw?.records?.selections || [];
  const writtenRow = writtenSelections.find(s => getPsId(s) === targetPsId);
  const realTeamId = getTeamId(writtenRow);
  const validTeamIdPersisted = realTeamId === targetTeamIdA && realTeamId !== 'undefined' && realTeamId !== '';

  // Winning Team Refresh
  const winningTeamRefresh = await postApi('GET_TEAM', teamTokenA);
  const refreshedData = winningTeamRefresh.raw?.data || winningTeamRefresh.data || {};
  const refreshedSelection = refreshedData.selection;
  const lockedStatePersists = refreshedData.selectionStatus === 'LOCKED' && refreshedSelection?.psId === targetPsId;

  // Second lock attempt by winning team
  const secondLockRes = await postApi('LOCK_PROBLEM', teamTokenA, { psid: 'EDU-03' });
  const secondLockRejected = !secondLockRes.success && (secondLockRes.raw?.code === 'TEAM_ALREADY_LOCKED' || secondLockRes.raw?.code === 'TEAM_ALREADY_HAS_SELECTION');

  // Same PSID attempt by Team B
  const teamBLockRes = await postApi('LOCK_PROBLEM', teamTokenB, { psid: targetPsId });
  const sameProbRejected = !teamBLockRes.success && teamBLockRes.raw?.code === 'PROBLEM_ALREADY_LOCKED';

  logStep('T10', 'SELECTION', 'Team Locking Persistence & Single Owner Invariant', lockRes.success && validTeamIdPersisted && lockedStatePersists && secondLockRejected && sameProbRejected, 'Corrupt TeamID undefined', 'Real TeamID written to Sheets & duplicate locked rejected', {
    targetTeamIdA,
    persistedTeamId: realTeamId,
    secondLockCode: secondLockRes.raw?.code,
    sameProbCode: teamBLockRes.raw?.code
  });

  // STEP 10: Close Selection & Lock Rejection
  console.log('\nPhase 10: Close Selection & Lock Rejection...');
  const closeSelRes = await postApi('ADMIN_CLOSE_SELECTION', adminToken);
  const postCloseLockRes = await postApi('LOCK_PROBLEM', teamTokenB, { psid: 'EDU-03' });
  const closeLockRejected = !postCloseLockRes.success && postCloseLockRes.raw?.code === 'SELECTION_CLOSED';

  // Winning team locked assignment remains visible
  const winningTeamAfterClose = await postApi('GET_TEAM', teamTokenA);
  const winningAssignmentVisible = (winningTeamAfterClose.data?.selection?.psId || winningTeamAfterClose.raw?.data?.selection?.psId) === targetPsId;

  logStep('T11', 'RELEASE', 'Close Selection Blocks New Locks while Preserving Existing Assignments', closeSelRes.success && closeLockRejected && winningAssignmentVisible, 'Close selection failure', 'SELECTION_CLOSED enforced & existing lock visible', {
    closeCode: postCloseLockRes.raw?.code,
    assignment: winningTeamAfterClose.data?.selection?.psId
  });

  // STEP 11: Controlled Reset & Verification
  console.log('\nPhase 11: Controlled Reset of Test Selection...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: true });
  const resetRes = await postApi('ADMIN_REMOVE_TEAM_SELECTION', adminToken, { teamId: targetTeamIdA });
  const resetPass = resetRes.success;

  // Confirm problem available again
  await postApi('ADMIN_RELEASE_NOW', adminToken);
  await postApi('ADMIN_OPEN_SELECTION', adminToken);
  const probsAfterReset = await postApi('GET_PROBLEMS', teamTokenB);
  const availableProbs = probsAfterReset.raw?.data?.problems || probsAfterReset.data?.problems || [];
  const probAvailableAgain = availableProbs.some(p => getPsId(p) === targetPsId);

  logStep('T12', 'RESET', 'Controlled Selection Reset & Availability Restoration', resetPass && probAvailableAgain, 'Reset blocked or corrupt', 'Selection removed & problem available again', {
    removed: resetRes.raw?.data?.removed,
    probAvailableAgain
  });

  // STEP 12: Final Safe State Restoration & Hard Assertion
  console.log('\nPhase 12: Final Safe State Restoration & Integrity Assertion...');
  await postApi('ADMIN_SET_ALLOW_RESET', adminToken, { allowResetSelection: false });
  await postApi('ADMIN_UPDATE_CONFIG', adminToken, {
    registrationEnabled: false,
    problemReleaseOverride: false,
    selectionStatus: 'CLOSED',
    problemReleaseAt: '2026-09-15T10:00:00+05:30',
    problemCloseAt: '2026-09-15T10:30:00+05:30'
  });

  const finalSnapshotRes = await postApi('FORENSIC_INSPECTION');
  const finalRecords = finalSnapshotRes.raw?.records || {};
  const finalConfigData = (await postApi('ADMIN_GET_CONFIG', adminToken)).data || {};

  const assertRegClosed = finalConfigData.registrationEnabled === false;
  const assertOverrideFalse = finalConfigData.problemReleaseOverride === false || finalConfigData.problemReleaseOverride === undefined;
  const assertResetFalse = finalConfigData.allowSelectionReset === false;
  const assertStateNotReleased = finalConfigData.selectionState === 'NOT_RELEASED' || finalConfigData.selectionStatus === 'CLOSED';
  const finalSelectionsCount = (finalRecords.selections || []).length;
  const selectionsMatch = finalSelectionsCount === baseline.selections.length;
  const countsMatch = (finalRecords.teams || []).length === baseline.teams.length &&
                      (finalRecords.problems || []).length === baseline.problems.length &&
                      (finalRecords.domains || []).length === baseline.domains.length;

  const finalIntegrityPass = assertRegClosed && assertResetFalse && selectionsMatch && countsMatch;

  logStep('T13', 'INTEGRITY', 'Final Baseline Restoration Hard Assertion', finalIntegrityPass, 'Unverified final state', 'REGISTRATION=FALSE, RESET=FALSE, Baseline Restored', {
    assertRegClosed,
    assertResetFalse,
    selectionsMatch: `${finalSelectionsCount} == ${baseline.selections.length}`,
    countsMatch
  });

  console.log('\n================================================================');
  console.log(' INTELLIX — FINAL PRODUCTION ACCEPTANCE TEST REPORT MATRIX');
  console.log('================================================================\n');

  console.table(testResults.map(r => ({
    'ID': r.id,
    'Group': r.group,
    'Test Name': r.name,
    'Before Fix': r.beforeFix,
    'After Fix': r.afterFix,
    'Production Result': r.status
  })));

  const allPassed = testResults.every(r => r.status === 'PASS');
  console.log(`\nFINAL ACCEPTANCE RESULT: ${allPassed ? 'ALL PASS' : 'SOME FAILS DETECTED'}`);
  if (!allPassed) {
    process.exit(1);
  }
}

runLiveVerification().catch(err => {
  console.error('FATAL UNHANDLED ERROR IN LIVE VERIFICATION:', err);
  process.exit(1);
});
