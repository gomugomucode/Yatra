type EscrowSource = {
  status?: string;
  createdAt?: string;
  timestamp?: string;
};

export function canReclaimEscrow(
  source: EscrowSource,
  nowMs: number = Date.now(),
  timeoutMs: number = 2 * 60 * 60 * 1000
): boolean {
  const terminalReclaimableStatuses = new Set(['cancelled', 'rejected', 'expired']);
  if (source.status && terminalReclaimableStatuses.has(source.status)) {
    return true;
  }

  const createdAtRaw = source.timestamp || source.createdAt;
  if (!createdAtRaw) return false;
  const createdAtMs = new Date(createdAtRaw).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return nowMs - createdAtMs > timeoutMs;
}

