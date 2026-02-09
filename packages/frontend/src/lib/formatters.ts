/** 상대 시간 포맷팅 (예: "3분 전") */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${String(days)}d ago`;
  if (hours > 0) return `${String(hours)}h ago`;
  if (minutes > 0) return `${String(minutes)}m ago`;
  return `${String(seconds)}s ago`;
}

/** 주소 축약 (예: "0x1a2b...3c4d") */
export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** MON 포맷팅 (wei → MON) */
export function formatMON(wei: bigint): string {
  const mon = Number(wei) / 1e18;
  return mon.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
