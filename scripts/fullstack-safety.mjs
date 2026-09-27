/** Test harness only. Never imported by a production application route. */
export function requireDisposableBrowserDatabase(env = process.env) {
  if (env.WRITING_FULLSTACK_ACK !== 'ONLY_SYNTHETIC_TEST_DATA' || env.NODE_ENV !== 'test')
    throw new Error('Full-stack browser fixtures require explicit synthetic test acknowledgement and NODE_ENV=test');
  const db = new URL(env.DATABASE_URL ?? 'invalid:');
  if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname) ||
      db.pathname !== '/writing_browser_test' || db.hash ||
      [...db.searchParams].some(([key,value])=>key!=='schema'||value!=='public'))
    throw new Error('Full-stack browser fixtures require a disposable loopback writing_browser_test database');
}
