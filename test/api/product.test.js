const KAFKA_BROKER_PORT = 10001; //This has to be at the top as require('../../src/app.js) will expect this on require itself
process.env.KAFKA_BROKER_PORT = KAFKA_BROKER_PORT;

const { setExpectations, stopStub, startStub, startKafkaStub, stopKafkaStub, verifyKafkaStub } = require('specmatic');
const request = require('supertest');
const app = require('../../src/app.js');

var stub, kafkaStub;

beforeAll(async () => {
    kafkaStub = await startKafkaStub(KAFKA_BROKER_PORT);
    stub = await startStub();
    await setExpectations('test-resources/products.json', stub.url);
}, 10000);

test('findAvailableProducts gives a list of products', async () => {
    const res = await request(app).get('/findAvailableProducts?type=test').accept('application/json').expect(200);
    expect(Array.isArray(res.body)).toBeTruthy();
    expect(res.body.length).toEqual(1);
    const value = JSON.stringify({ id: 2, name: 'iPhone', type: 'gadget', inventory: 5 });
    await expect(verifyKafkaStub(kafkaStub, 'product-queries', 'test', value)).resolves.toBeTruthy();
}, 5000);

afterAll(() => {
    stopStub(stub);
    stopKafkaStub(kafkaStub);
});
