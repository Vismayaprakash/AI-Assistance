const http = require('http');

const PORT = 3000;
let businessId = '';
let convoId = '';

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : '';
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`API Error ${res.statusCode}: ${parsed.error || body}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          } else {
            resolve(body);
          }
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🏁 Starting public Widget API test suite...');

  // 1. Get token by logging in first
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  const token = loginRes.token;

  // 2. Create business (authenticated)
  const biz = await request('POST', '/api/business', {
    name: 'Cosmetic Salon and Spa',
    type: 'salon',
    description: 'Premier styling salon.',
    greeting_message: 'Hi there! Welcome to Cosmetic Salon. How can I pamper you?'
  }, { 'Authorization': `Bearer ${token}` });
  businessId = biz.id;
  console.log('✅ Created business:', businessId);

  // 3. Import salon template (authenticated)
  await request('POST', '/api/knowledge/import-template', {
    business_id: businessId,
    template: 'salon'
  }, { 'Authorization': `Bearer ${token}` });
  console.log('✅ Salon template imported');

  // 4. Test public GET /api/widget/business/:id
  console.log('\n🔍 [GET /api/widget/business/:id]');
  const pubBiz = await request('GET', `/api/widget/business/${businessId}`);
  console.log('✅ Public Business Name:', pubBiz.name);
  console.log('✅ Public Greeting:', pubBiz.greeting_message);

  // 5. Test public POST /api/widget/chat
  console.log('\n💬 [POST /api/widget/chat] - Start Conversation');
  const chatRes1 = await request('POST', '/widget/chat', {
    business_id: businessId,
    message: 'What hours are you open on Saturday?'
  });
  convoId = chatRes1.conversation_id;
  console.log('✅ Response:', chatRes1.response);
  console.log('✅ Conversation ID:', convoId);

  // 6. Test public POST /api/widget/chat - Continue Conversation
  console.log('\n💬 [POST /api/widget/chat] - Continue Conversation');
  const chatRes2 = await request('POST', '/widget/chat', {
    business_id: businessId,
    conversation_id: convoId,
    message: 'Do you offer hair styling?'
  });
  console.log('✅ Response:', chatRes2.response);

  // 7. Test public POST /api/widget/close
  console.log('\n🏁 [POST /api/widget/close]');
  const closeRes = await request('POST', '/widget/close', {
    conversation_id: convoId
  });
  console.log('✅ Closed session. Summary:', closeRes.summary);

  // Clean up
  await request('DELETE', `/api/business/${businessId}`, null, { 'Authorization': `Bearer ${token}` });
  console.log('🧹 Cleaned up test business.');
  console.log('\n🎉 ALL WIDGET API TESTS PASSED! 🎉');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
});
