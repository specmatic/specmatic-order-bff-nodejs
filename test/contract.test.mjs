import { config } from "dotenv";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import specmatic from "specmatic";
import { GenericContainer, Wait } from "testcontainers";
import { getApp, startAppServer, stopAppServer } from "./util/app.server.js";

const TEST_TIMEOUT_MS = 10 * 60 * 1000;
const REPORT_DUMP_TIMEOUT_MS = 30 * 1000;
const KAFKA_API_SERVER = "http://localhost:9999";
const KAFKA_VERIFY_CHANNEL = "product-queries";
const KAFKA_EXPECTED_MESSAGE_COUNT = 2;
const REPORTS_DIR = path.resolve("./build/reports/specmatic");
describe("Contract Tests", () => {
    /**
     * @type {any}
     */
    let appServer;
    /**
     * @type {import("testcontainers").StartedTestContainer}
     */
    let specmaticKafkaContainer;
    /**
     * @type {import("specmatic/dist/core/index.js").Stub}
     */
    let httpStub;

    beforeAll(async () => {
        config();
        const excludedEndpoints = "'/health'";
        process.env.FILTER = `PATH!=${excludedEndpoints}`;
        if (!existsSync(REPORTS_DIR)) {
            mkdirSync(REPORTS_DIR, { recursive: true });
        }
        appServer = await startAppServer(process.env.APP_PORT);
        httpStub = await specmatic.startHttpStub();
        specmaticKafkaContainer = await new GenericContainer("specmatic/enterprise")
            .withBindMounts([
                { source: path.resolve("specmatic.yaml"), target: "/usr/src/app/specmatic.yaml" },
                { source: REPORTS_DIR, target: "/usr/src/app/build/reports/specmatic" },
            ])
            .withCommand(["mock"])
            .withExposedPorts({ host: 9092, container: 9092 })
            .withExposedPorts({ host: 9999, container: 9999 })
            .withAutoRemove(true)
            .withLogConsumer(stream => {
                stream.on("data", process.stdout.write.bind(process.stdout));
                stream.on("err", process.stderr.write.bind(process.stderr));
                stream.on("end", () => process.stdout.write("Specmatic mock stopped"));
            })
            .withWaitStrategy(Wait.forLogMessage(/AsyncMock has started/i))
            .start();
        await snapshotKafkaExpectations(KAFKA_API_SERVER);
        await setupExpectations(httpStub.url);
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
        await stopAppServer(appServer);
        await specmatic.stopHttpStub(httpStub);
        await dumpAsyncReports();
        console.log("Stopping Specmatic Kafka container");
        await specmaticKafkaContainer.stop({ remove: true, removeVolumes: true });
        console.log("Specmatic Kafka container stopped");
    }, TEST_TIMEOUT_MS);

    test("Run tests and verify expectations", async () => {
        await specmatic.testWithApiCoverage(getApp());
        await verifyKafkaExpectations(KAFKA_API_SERVER);
    }, TEST_TIMEOUT_MS);
});


/**
 * Sets up HTTP expectations from local test resources.
 * @param {string} httpStubUrl - URL of the HTTP stub server
 */
async function setupExpectations(httpStubUrl) {
    await setupHttpExpectations(httpStubUrl);
}

/**
 * Sets up HTTP expectations from the JSON files in the test-resources folder
 * @param {string} httpStubUrl - URL of the HTTP stub server
 */
async function setupHttpExpectations(httpStubUrl) {
    const test_folder = "test-resources";
    readdirSync(test_folder).map(
        async (fileName) => await specmatic.setExpectations(path.join(test_folder, fileName), httpStubUrl)
    );
}

/**
 * Captures Kafka snapshot so Specmatic can track the expected channel activity.
 * @param {string} kafkaMockUrl - URL of the Kafka mock server
 */
async function snapshotKafkaExpectations(kafkaMockUrl) {
    const response = await fetch(`${kafkaMockUrl}/_specmatic/snapshot`, {
        method: "POST",
    })
    if (!response.ok) throw new Error(await response.text());
}

/**
 * Verifies the Kafka expectations for the product-queries channel.
 * @param {string} kafkaMockUrl - URL of the Kafka mock server
 */
async function verifyKafkaExpectations(kafkaMockUrl) {
    const response = await fetch(`${kafkaMockUrl}/_specmatic/verify?channels=${KAFKA_VERIFY_CHANNEL}`);
    if (!response.ok) throw new Error(await response.text());

    const verificationCounts = await response.json();
    const actualCount = verificationCounts[KAFKA_VERIFY_CHANNEL];

    expect(
        actualCount,
        `Kafka verification failed for ${KAFKA_VERIFY_CHANNEL}. Expected ${KAFKA_EXPECTED_MESSAGE_COUNT}, got ${actualCount ?? "undefined"}.`
    ).toBe(KAFKA_EXPECTED_MESSAGE_COUNT);
}

async function dumpAsyncReports() {
    console.log("Dumping kafka mock reports..");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPORT_DUMP_TIMEOUT_MS);
    try {
        const response = await fetch(`${KAFKA_API_SERVER}/_specmatic/stop`, {
            method: "POST",
            body: "",
            signal: controller.signal,
        });
        if (response.ok) {
            console.log("Reports dumped successfully!");
        } else {
            console.log("Error occurred while dumping the reports");
        }
    } catch (error) {
        if (error.name === "AbortError") {
            console.log(`Dumping kafka mock reports timed out after ${REPORT_DUMP_TIMEOUT_MS}ms. Proceeding with teardown.`);
        } else {
            console.log("Error occurred while dumping the reports", error);
        }
    } finally {
        clearTimeout(timeout);
    }
}
