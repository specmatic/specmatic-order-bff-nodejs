const specmatic = require('specmatic');

const KAFKA_BROKER_PORT = 9001;
const HTTP_STUB_PORT = 10002;

process.env.KAFKA_BROKER_PORT = KAFKA_BROKER_PORT;
process.env.API_PORT = HTTP_STUB_PORT;

console.log('before...');

module.exports = async function () {
    var httpStub, kafkaStub, appServer;
    kafkaStub = await specmatic.startKafkaStub(KAFKA_BROKER_PORT);
    httpStub = await specmatic.startStub('localhost', HTTP_STUB_PORT);
    await specmatic.setExpectations('test-resources/products.json', httpStub.url);
    global.specmatic = { appServer, httpStub, kafkaStub };
};
