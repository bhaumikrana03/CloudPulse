process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@test.io';
process.env.ADMIN_PASSWORD = 'test-password-1';
const request = require('supertest');
const { app } = require('../src/server');
const { LoadBalancer } = require('../src/services/loadBalancer');

const registry = [
  { id: 'a', name: 'a', region: 'x', cap: 10 },
  { id: 'b', name: 'b', region: 'y', cap: 10 },
];

describe.each(['greedy', 'heap'])('%s scheduler', (algo) => {
  test('spreads load evenly and rejects when full', () => {
    const lb = new LoadBalancer(registry); lb.setAlgo(algo);
    const r = lb.dispatchBatch(25, 1);
    expect(r.sent).toBe(20); expect(r.rejected).toBe(5);
    expect(lb.servers.map((s) => s.load)).toEqual([10, 10]);
  });
  test('skips draining and failed servers', () => {
    const lb = new LoadBalancer(registry); lb.setAlgo(algo);
    lb.control('a', 'drain'); lb.dispatchBatch(4, 1);
    expect(lb.servers[0].load).toBe(0); expect(lb.servers[1].load).toBe(4);
    lb.control('b', 'fail'); expect(lb.servers[1].load).toBe(0);
    expect(lb.dispatchBatch(3, 1).rejected).toBe(3);
    lb.control('a', 'restore'); expect(lb.dispatchBatch(3, 1).sent).toBe(3);
  });
});

test('rejects invalid input', () => {
  const lb = new LoadBalancer(registry);
  expect(() => lb.dispatchBatch(0, 1)).toThrow();
  expect(() => lb.setAlgo('random')).toThrow();
  expect(() => lb.control('zzz', 'drain')).toThrow('Unknown server.');
});

describe('API auth', () => {
  test('blocks control calls without a token', async () => {
    expect((await request(app).get('/api/lb/state')).status).toBe(401);
    expect((await request(app).post('/api/lb/servers/srv-01/fail')).status).toBe(401);
  });
  test('rejects a wrong password', async () => {
    const r = await request(app).post('/api/auth/login').send({ identifier: 'admin@test.io', password: 'nope-nope' });
    expect(r.status).toBe(401);
  });
  test('login token unlocks the API', async () => {
    const login = await request(app).post('/api/auth/login').send({ identifier: 'admin@test.io', password: 'test-password-1' });
    expect(login.status).toBe(200);
    const r = await request(app).get('/api/lb/state').set('Authorization', `Bearer ${login.body.token}`);
    expect(r.status).toBe(200); expect(r.body.servers).toHaveLength(4);
  });
});
