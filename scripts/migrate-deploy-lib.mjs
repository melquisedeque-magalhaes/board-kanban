export function isAdvisoryLockTimeout(output) {
  return /P1002|advisory lock|timed out.*database server/i.test(output);
}
