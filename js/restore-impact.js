/** TravelIt pre-restore impact report. Pure, non-mutating, and never a substitute for
 * SHA-256 verification or the storage-boundary optimistic revision guard.
 * Source records and map packages are not modified by this calculation.
 */
import {VALID_TYPES} from './domain.js';

export function restoreImpact(current, incoming) {
  if (!Array.isArray(current?.records) || !Array.isArray(current?.outbox) ||
      !Array.isArray(incoming?.records) || !Array.isArray(incoming?.outbox)) {
    throw Error('Cannot preview this workspace or backup.');
  }
  const from = new Map();
  const to = new Map();
  for (const row of current.records) {
    if (!row || !VALID_TYPES.includes(row.type) || row.key !== `${row.type}:${row.id}` || from.has(row.key))
      throw Error('The current workspace has invalid or duplicate record IDs. Export a backup and run Local Data Diagnostics before restoring.');
    from.set(row.key, row);
  }
  for (const row of incoming.records) {
    if (!row || !VALID_TYPES.includes(row.type) || row.key !== `${row.type}:${row.id}` || to.has(row.key))
      throw Error('The imported backup has invalid or duplicate record IDs.');
    to.set(row.key, row);
  }
  const changes = Object.fromEntries(VALID_TYPES.map(type => [type, {current:0,incoming:0,added:0,overwritten:0,removed:0,unchanged:0}]));
  for (const row of from.values()) changes[row.type].current++;
  for (const row of to.values()) changes[row.type].incoming++;
  for (const [key,row] of from) {
    const target = to.get(key);
    if (!target) { changes[row.type].removed++; continue; }
    if (JSON.stringify(row.data) === JSON.stringify(target.data)) changes[row.type].unchanged++;
    else changes[row.type].overwritten++;
  }
  for (const [key,row] of to) if (!from.has(key)) changes[row.type].added++;
  const totals={current:current.records.length,incoming:incoming.records.length,
    added:0,overwritten:0,removed:0,unchanged:0};
  for (const item of Object.values(changes)) for (const k of ['added','overwritten','removed','unchanged']) totals[k]+=item[k];
  return {
    totals,byType:changes,
    localCommandsDiscarded:current.outbox.length,
    importedCommands:incoming.outbox.length,
    mapPackagesRetained:true,
    localRecoverySlotWillBeReplaced:true,
    warning:'This replaces the entire local travel workspace; existing regional maps are separate and are not part of the backup. A one-level recovery snapshot is retained locally, not permanently.'
  };
}
