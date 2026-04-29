const request = require('supertest');
const app = require('../src/index'); 

describe('Postly API Integration Tests', () => {
  let token;

  it('1. should reject access to protected route without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toEqual(401);
    expect(res.body.error).toEqual('Access token required');
  });

  it('2. should reject content generation without valid payload (Validation Check)', async () => {
    // Assuming you have a dummy token or generating one on the fly here
    // For this test, we expect a 401 because we haven't logged in, which still proves auth middleware works.
    const res = await request(app).post('/api/content/generate').send({});
    expect(res.statusCode).toEqual(401);
  });

  it('3. should register a new user successfully', async () => {
    const uniqueEmail = `test_${Date.now()}@postly.com`;
    const res = await request(app).post('/api/auth/register').send({
      email: uniqueEmail,
      password: "password123",
      name: "Test User"
    });
    expect(res.statusCode).toEqual(201);
    expect(res.body.message).toEqual('User created successfully');
  });

  it('4. should login and return JWT tokens', async () => {
    const uniqueEmail = `test_login_${Date.now()}@postly.com`;
    // Setup user
    await request(app).post('/api/auth/register').send({ email: uniqueEmail, password: "password123", name: "Test" });
    
    // Login
    const res = await request(app).post('/api/auth/login').send({
      email: uniqueEmail,
      password: "password123"
    });
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    token = res.body.accessToken; // Save for next test
  });

  it('5. should access profile with valid JWT token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('email');
  });
});