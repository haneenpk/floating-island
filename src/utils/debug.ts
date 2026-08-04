export function hasDebugFlag(flag: string): boolean {
  const value = new URLSearchParams(window.location.search).get('debug');
  if (!value) return false;
  return value.split(',').includes(flag);
}
